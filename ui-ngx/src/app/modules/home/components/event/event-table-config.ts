///
/// Copyright © 2016-2022 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import {
  DateEntityTableColumn,
  EntityActionTableColumn,
  EntityTableColumn,
  EntityTableConfig
} from '@home/models/entity/entities-table-config.models';
import { DebugEventType, Event, EventType, FilterEventBody } from '@shared/models/event.models';
import { TimePageLink } from '@shared/models/page/page-link';
import { TranslateService } from '@ngx-translate/core';
import { DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { EntityId } from '@shared/models/id/entity-id';
import { EventService } from '@app/core/http/event.service';
import { EventTableHeaderComponent } from '@home/components/event/event-table-header.component';
import { EntityTypeResource } from '@shared/models/entity-type.models';
import { Observable } from 'rxjs';
import { PageData } from '@shared/models/page/page-data';
import { Direction } from '@shared/models/page/sort-order';
import { DialogService } from '@core/services/dialog.service';
import { ContentType } from '@shared/models/constants';
import {
  EventContentDialogComponent,
  EventContentDialogData
} from '@home/components/event/event-content-dialog.component';
import { isEqual, sortObjectKeys } from '@core/utils';
import { ConnectedPosition, Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ChangeDetectorRef, Injector, StaticProvider, ViewContainerRef } from '@angular/core';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  EVENT_FILTER_PANEL_DATA,
  EventFilterPanelComponent,
  EventFilterPanelData,
  FilterEntityColumn
} from '@home/components/event/event-filter-panel.component';

export class EventTableConfig extends EntityTableConfig<Event, TimePageLink> {

  eventTypeValue: EventType | DebugEventType;
  hideClearEventAction = false;

  private filterParams: FilterEventBody = {};
  private filterColumns: FilterEntityColumn[] = [];

  set eventType(eventType: EventType | DebugEventType) {
    if (this.eventTypeValue !== eventType) {
      this.eventTypeValue = eventType;
      this.updateColumns(true);
      this.updateFilterColumns();
    }
  }

  get eventType(): EventType | DebugEventType {
    return this.eventTypeValue;
  }

  eventTypes: Array<EventType | DebugEventType>;

  constructor(private eventService: EventService,
              private dialogService: DialogService,
              private translate: TranslateService,
              private datePipe: DatePipe,
              private dialog: MatDialog,
              public entityId: EntityId,
              public tenantId: string,
              private defaultEventType: EventType | DebugEventType,
              private disabledEventTypes: Array<EventType | DebugEventType> = null,
              private debugEventTypes: Array<DebugEventType> = null,
              private overlay: Overlay,
              private viewContainerRef: ViewContainerRef,
              private cd: ChangeDetectorRef) {
    super();
    this.loadDataOnInit = false;
    this.tableTitle = '';
    this.useTimePageLink = true;
    this.detailsPanelEnabled = false;
    this.selectionEnabled = false;
    this.searchEnabled = false;
    this.addEnabled = false;
    this.entitiesDeleteEnabled = false;
    this.pageMode = false;

    this.headerComponent = EventTableHeaderComponent;

    this.eventTypes = Object.keys(EventType).map(type => EventType[type]);

    if (disabledEventTypes && disabledEventTypes.length) {
      this.eventTypes = this.eventTypes.filter(type => disabledEventTypes.indexOf(type) === -1);
    }

    if (debugEventTypes && debugEventTypes.length) {
      this.eventTypes = [...this.eventTypes, ...debugEventTypes];
    }

    this.eventTypeValue = defaultEventType;

    this.entityTranslations = {
      noEntities: 'event.no-events-prompt'
    };
    this.entityResources = {
    } as EntityTypeResource<Event>;
    this.entitiesFetchFunction = pageLink => this.fetchEvents(pageLink);

    this.defaultSortOrder = {property: 'createdTime', direction: Direction.DESC};

    this.updateColumns();
    this.updateFilterColumns();

    this.headerActionDescriptors.push({
      name: this.translate.instant('event.clear-filter'),
      icon: 'mdi:filter-variant-remove',
      isMdiIcon: true,
      isEnabled: () => !isEqual(this.filterParams, {}),
      onAction: ($event) => {
        this.clearFiter($event);
      }
    },
    {
      name: this.translate.instant('event.events-filter'),
      icon: 'filter_list',
      isEnabled: () => true,
      onAction: ($event) => {
        this.editEventFilter($event);
      }
    },
    {
      name: this.translate.instant('event.clean-events'),
      icon: 'delete',
      isEnabled: () => !this.hideClearEventAction,
      onAction: $event => this.clearEvents($event)
    });
  }

  clearEvents($event) {
    if ($event) {
      $event.stopPropagation();
    }
    this.dialogService.confirm(
      this.translate.instant('event.clear-request-title'),
      this.translate.instant('event.clear-request-text'),
      this.translate.instant('action.no'),
      this.translate.instant('action.yes')
    ).subscribe((res) => {
      if (res) {
        this.eventService.clearEvents(this.entityId, this.eventType, this.filterParams,
          this.tenantId, this.getTable().pageLink as TimePageLink).subscribe(
          () => {
            this.getTable().paginator.pageIndex = 0;
            this.updateData();
          }
        );
      }
    });
  }

  fetchEvents(pageLink: TimePageLink): Observable<PageData<Event>> {
    return this.eventService.getFilterEvents(this.entityId, this.eventType, this.tenantId, this.filterParams, pageLink);
  }

  updateColumns(updateTableColumns: boolean = false): void {
    this.columns = [];
    this.columns.push(
      new DateEntityTableColumn<Event>('createdTime', 'event.event-time', this.datePipe, '120px'),
      new EntityTableColumn<Event>('server', 'event.server', '100px',
        (entity) => entity.body.server, entity => ({}), false));
    switch (this.eventType) {
      case EventType.ERROR:
        this.columns.push(
        new EntityTableColumn<Event>('method', 'event.method', '100%',
          (entity) => entity.body.method, entity => ({}), false),
          new EntityActionTableColumn<Event>('error', 'event.error',
            {
              name: this.translate.instant('action.view'),
              icon: 'more_horiz',
              isEnabled: (entity) => entity.body.error && entity.body.error.length > 0,
              onAction: ($event, entity) => this.showContent($event, entity.body.error, 'event.error')
            },
            '100px')
        );
        break;
      case EventType.LC_EVENT:
        this.columns.push(
          new EntityTableColumn<Event>('method', 'event.event', '100%',
            (entity) => entity.body.event, entity => ({}), false),
          new EntityTableColumn<Event>('status', 'event.status', '100%',
            (entity) =>
              this.translate.instant(entity.body.success ? 'event.success' : 'event.failed'), entity => ({}), false),
          new EntityActionTableColumn<Event>('error', 'event.error',
            {
              name: this.translate.instant('action.view'),
              icon: 'more_horiz',
              isEnabled: (entity) => entity.body.error && entity.body.error.length > 0,
              onAction: ($event, entity) => this.showContent($event, entity.body.error, 'event.error')
            },
            '100px')
        );
        break;
      case EventType.STATS:
        this.columns.push(
          new EntityTableColumn<Event>('messagesProcessed', 'event.messages-processed', '50%',
            (entity) => entity.body.messagesProcessed + '',
            () => ({}),
            false,
            () => ({}), () => undefined, true),
          new EntityTableColumn<Event>('errorsOccurred', 'event.errors-occurred', '50%',
            (entity) => entity.body.errorsOccurred + '',
            () => ({}),
            false,
            () => ({}), () => undefined, true)
        );
        break;
      case DebugEventType.DEBUG_RULE_NODE:
      case DebugEventType.DEBUG_RULE_CHAIN:
        this.columns[0].width = '100px';
        this.columns.push(
          new EntityTableColumn<Event>('type', 'event.type', '40px',
            (entity) => entity.body.type, entity => ({
              padding: '0 12px 0 0',
            }), false, key => ({
              padding: '0 12px 0 0'
            })),
          new EntityTableColumn<Event>('entityName', 'event.entity-type', '100px',
            (entity) => entity.body.entityName, entity => ({
              padding: '0 12px 0 0',
            }), false, key => ({
              padding: '0 12px 0 0'
            })),
          new EntityTableColumn<Event>('msgId', 'event.message-id', '100px',
            (entity) => entity.body.msgId, entity => ({
              whiteSpace: 'nowrap',
              padding: '0 12px 0 0'
            }), false, key => ({
              padding: '0 12px 0 0'
            }),
            entity => entity.body.msgId),
          new EntityTableColumn<Event>('msgType', 'event.message-type', '100px',
            (entity) => entity.body.msgType, entity => ({
              whiteSpace: 'nowrap',
              padding: '0 12px 0 0'
            }), false, key => ({
              padding: '0 12px 0 0'
            }),
            entity => entity.body.msgType),
          new EntityTableColumn<Event>('relationType', 'event.relation-type', '100px',
            (entity) => entity.body.relationType, entity => ({padding: '0 12px 0 0', }), false, key => ({
              padding: '0 12px 0 0'
            })),
          new EntityActionTableColumn<Event>('data', 'event.data',
            {
              name: this.translate.instant('action.view'),
              icon: 'more_horiz',
              isEnabled: (entity) => entity.body.data ? entity.body.data.length > 0 : false,
              onAction: ($event, entity) => this.showContent($event, entity.body.data,
                'event.data', entity.body.dataType)
            },
            '40px'),
          new EntityActionTableColumn<Event>('metadata', 'event.metadata',
            {
              name: this.translate.instant('action.view'),
              icon: 'more_horiz',
              isEnabled: (entity) => entity.body.metadata ? entity.body.metadata.length > 0 : false,
              onAction: ($event, entity) => this.showContent($event, entity.body.metadata,
                'event.metadata', ContentType.JSON, true)
            },
            '40px'),
          new EntityActionTableColumn<Event>('error', 'event.error',
            {
              name: this.translate.instant('action.view'),
              icon: 'more_horiz',
              isEnabled: (entity) => entity.body.error && entity.body.error.length > 0,
              onAction: ($event, entity) => this.showContent($event, entity.body.error,
                'event.error')
            },
            '40px')
        );
        break;
    }
    if (updateTableColumns) {
      this.getTable().columnsUpdated(true);
    }
  }

  showContent($event: MouseEvent, content: string, title: string, contentType: ContentType = null, sortKeys = false): void {
    if ($event) {
      $event.stopPropagation();
    }
    if (contentType === ContentType.JSON && sortKeys) {
      try {
        content = JSON.stringify(sortObjectKeys(JSON.parse(content)));
      } catch (e) {}
    }
    this.dialog.open<EventContentDialogComponent, EventContentDialogData>(EventContentDialogComponent, {
      disableClose: true,
      panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
      data: {
        content,
        title,
        contentType
      }
    });
  }

  private updateFilterColumns() {
    this.filterParams = {};
    this.filterColumns = [{key: 'server', title: 'event.server'}];
    switch (this.eventType) {
      case EventType.ERROR:
        this.filterColumns.push(
          {key: 'method', title: 'event.method'},
          {key: 'errorStr', title: 'event.error'}
        );
        break;
      case EventType.LC_EVENT:
        this.filterColumns.push(
          {key: 'event', title: 'event.event'},
          {key: 'status', title: 'event.status'},
          {key: 'errorStr', title: 'event.error'}
        );
        break;
      case EventType.STATS:
        this.filterColumns.push(
          {key: 'messagesProcessed', title: 'event.min-messages-processed'},
          {key: 'errorsOccurred', title: 'event.min-errors-occurred'}
        );
        break;
      case DebugEventType.DEBUG_RULE_NODE:
      case DebugEventType.DEBUG_RULE_CHAIN:
        this.filterColumns.push(
          {key: 'msgDirectionType', title: 'event.type'},
          {key: 'entityId', title: 'event.entity-id'},
          {key: 'entityName', title: 'event.entity-type'},
          {key: 'msgType', title: 'event.message-type'},
          {key: 'relationType', title: 'event.relation-type'},
          {key: 'dataSearch', title: 'event.data'},
          {key: 'metadataSearch', title: 'event.metadata'},
          {key: 'isError', title: 'event.error'},
          {key: 'errorStr', title: 'event.error'}
        );
        break;
    }
  }

  private clearFiter($event) {
    if ($event) {
      $event.stopPropagation();
    }

    this.filterParams = {};
    this.getTable().paginator.pageIndex = 0;
    this.updateData();
  }

  private editEventFilter($event: MouseEvent) {
    if ($event) {
      $event.stopPropagation();
    }
    const target = $event.target || $event.srcElement || $event.currentTarget;
    const config = new OverlayConfig();
    config.backdropClass = 'cdk-overlay-transparent-backdrop';
    config.hasBackdrop = true;
    const connectedPosition: ConnectedPosition = {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top'
    };
    config.positionStrategy = this.overlay.position().flexibleConnectedTo(target as HTMLElement)
      .withPositions([connectedPosition]);

    const overlayRef = this.overlay.create(config);
    overlayRef.backdropClick().subscribe(() => {
      overlayRef.dispose();
    });
    const providers: StaticProvider[] = [
      {
        provide: EVENT_FILTER_PANEL_DATA,
        useValue: {
          columns: this.filterColumns,
          filterParams: this.filterParams
        } as EventFilterPanelData
      },
      {
        provide: OverlayRef,
        useValue: overlayRef
      }
    ];
    const injector = Injector.create({parent: this.viewContainerRef.injector, providers});
    const componentRef = overlayRef.attach(new ComponentPortal(EventFilterPanelComponent,
      this.viewContainerRef, injector));
    componentRef.onDestroy(() => {
      if (componentRef.instance.result && !isEqual(this.filterParams, componentRef.instance.result.filterParams)) {
        this.filterParams = componentRef.instance.result.filterParams;
        this.getTable().paginator.pageIndex = 0;
        this.updateData();
      }
    });
    this.cd.detectChanges();
  }
}

