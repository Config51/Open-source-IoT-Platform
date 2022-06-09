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
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Injector,
  Input,
  NgZone,
  OnInit,
  StaticProvider,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import { PageComponent } from '@shared/components/page.component';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { WidgetAction, WidgetContext } from '@home/models/widget-component.models';
import { DataKey, WidgetActionDescriptor, WidgetConfig } from '@shared/models/widget.models';
import { IWidgetSubscription } from '@core/api/widget-api.models';
import { UtilsService } from '@core/services/utils.service';
import { TranslateService } from '@ngx-translate/core';
import {
  createLabelFromDatasource,
  deepClone,
  hashCode,
  isDefined,
  isNumber,
  isObject,
  isUndefined
} from '@core/utils';
import cssjs from '@core/css/css';
import { sortItems } from '@shared/models/page/page-link';
import { Direction } from '@shared/models/page/sort-order';
import { CollectionViewer, DataSource, SelectionModel } from '@angular/cdk/collections';
import { BehaviorSubject, forkJoin, fromEvent, merge, Observable, Subscription } from 'rxjs';
import { emptyPageData, PageData } from '@shared/models/page/page-data';
import { entityTypeTranslations } from '@shared/models/entity-type.models';
import { debounceTime, distinctUntilChanged, map, take, tap } from 'rxjs/operators';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort, SortDirection } from '@angular/material/sort';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  CellContentInfo,
  CellStyleInfo,
  checkHasActions,
  constructTableCssString,
  DisplayColumn,
  EntityColumn,
  entityDataSortOrderFromString,
  findColumnByEntityKey,
  findEntityKeyByColumnDef,
  fromEntityColumnDef,
  getAlarmValue,
  getCellContentInfo,
  getCellStyleInfo,
  getColumnDefaultVisibility,
  getColumnSelectionAvailability,
  getColumnWidth,
  getRowStyleInfo,
  getTableCellButtonActions,
  noDataMessage,
  prepareTableCellButtonActions,
  RowStyleInfo,
  TableCellButtonActionDescriptor,
  TableWidgetDataKeySettings,
  TableWidgetSettings,
  widthStyle
} from '@home/components/widget/lib/table-widget.models';
import { ConnectedPosition, Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  DISPLAY_COLUMNS_PANEL_DATA,
  DisplayColumnsPanelComponent,
  DisplayColumnsPanelData
} from '@home/components/widget/lib/display-columns-panel.component';
import {
  AlarmDataInfo,
  alarmFields,
  AlarmSearchStatus,
  alarmSeverityColors,
  alarmSeverityTranslations,
  AlarmStatus,
  alarmStatusTranslations
} from '@shared/models/alarm.models';
import { DatePipe } from '@angular/common';
import {
  AlarmDetailsDialogComponent,
  AlarmDetailsDialogData
} from '@home/components/alarm/alarm-details-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { NULL_UUID } from '@shared/models/id/has-uuid';
import { DialogService } from '@core/services/dialog.service';
import { AlarmService } from '@core/http/alarm.service';
import {
  AlarmData,
  AlarmDataPageLink,
  dataKeyToEntityKey,
  dataKeyTypeToEntityKeyType,
  entityDataPageLinkSortDirection,
  KeyFilter
} from '@app/shared/models/query/query.models';
import { DataKeyType } from '@shared/models/telemetry/telemetry.models';
import {
  ALARM_FILTER_PANEL_DATA,
  AlarmFilterPanelComponent,
  AlarmFilterPanelData
} from '@home/components/widget/lib/alarm-filter-panel.component';
import { entityFields } from '@shared/models/entity.models';
import { coerceBooleanProperty } from '@angular/cdk/coercion';
import { ResizeObserver } from '@juggle/resize-observer';
import { hidePageSizePixelValue } from '@shared/models/constants';

interface AlarmsTableWidgetSettings extends TableWidgetSettings {
  alarmsTitle: string;
  enableSelectColumnDisplay: boolean;
  defaultSortOrder: string;
  enableSelection: boolean;
  enableStatusFilter?: boolean;
  enableFilter: boolean;
  displayDetails: boolean;
  allowAcknowledgment: boolean;
  allowClear: boolean;
}

interface AlarmWidgetActionDescriptor extends TableCellButtonActionDescriptor {
  details?: boolean;
  acknowledge?: boolean;
  clear?: boolean;
}

@Component({
  selector: 'tb-alarms-table-widget',
  templateUrl: './alarms-table-widget.component.html',
  styleUrls: ['./alarms-table-widget.component.scss', './table-widget.scss']
})
export class AlarmsTableWidgetComponent extends PageComponent implements OnInit, AfterViewInit {

  @Input()
  ctx: WidgetContext;

  @ViewChild('searchInput') searchInputField: ElementRef;
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  public enableSelection = true;
  public displayPagination = true;
  public enableStickyHeader = true;
  public enableStickyAction = false;
  public pageSizeOptions;
  public pageLink: AlarmDataPageLink;
  public sortOrderProperty: string;
  public textSearchMode = false;
  public hidePageSize = false;
  public columns: Array<EntityColumn> = [];
  public displayedColumns: string[] = [];
  public alarmsDatasource: AlarmsDatasource;
  public noDataDisplayMessageText: string;
  private setCellButtonAction: boolean;

  private cellContentCache: Array<any> = [];
  private cellStyleCache: Array<any> = [];
  private rowStyleCache: Array<any> = [];

  private settings: AlarmsTableWidgetSettings;
  private widgetConfig: WidgetConfig;
  private subscription: IWidgetSubscription;
  private widgetResize$: ResizeObserver;

  private alarmsTitlePattern: string;

  private displayDetails = true;
  public allowAcknowledgment = true;
  private allowClear = true;

  private defaultPageSize = 10;
  private defaultSortOrder = '-' + alarmFields.createdTime.value;

  private contentsInfo: {[key: string]: CellContentInfo} = {};
  private stylesInfo: {[key: string]: CellStyleInfo} = {};
  private columnWidth: {[key: string]: string} = {};
  private columnDefaultVisibility: {[key: string]: boolean} = {};
  private columnSelectionAvailability: {[key: string]: boolean} = {};

  private rowStylesInfo: RowStyleInfo;

  private widgetTimewindowChanged$: Subscription;

  private searchAction: WidgetAction = {
    name: 'action.search',
    show: true,
    icon: 'search',
    onAction: () => {
      this.enterFilterMode();
    }
  };

  private columnDisplayAction: WidgetAction = {
    name: 'entity.columns-to-display',
    show: true,
    icon: 'view_column',
    onAction: ($event) => {
      this.editColumnsToDisplay($event);
    }
  };

  private alarmFilterAction: WidgetAction = {
    name: 'alarm.alarm-filter',
    show: true,
    onAction: ($event) => {
      this.editAlarmFilter($event);
    },
    icon: 'filter_list'
  };

  constructor(protected store: Store<AppState>,
              private elementRef: ElementRef,
              private ngZone: NgZone,
              private overlay: Overlay,
              private viewContainerRef: ViewContainerRef,
              private utils: UtilsService,
              public translate: TranslateService,
              private domSanitizer: DomSanitizer,
              private datePipe: DatePipe,
              private dialog: MatDialog,
              private dialogService: DialogService,
              private alarmService: AlarmService,
              private cd: ChangeDetectorRef) {
    super(store);
    this.pageLink = {
      page: 0,
      pageSize: this.defaultPageSize,
      textSearch: null
    };
  }

  ngOnInit(): void {
    this.ctx.$scope.alarmsTableWidget = this;
    this.settings = this.ctx.settings;
    this.widgetConfig = this.ctx.widgetConfig;
    this.subscription = this.ctx.defaultSubscription;
    this.initializeConfig();
    this.updateAlarmSource();
    this.ctx.updateWidgetParams();

    if (this.displayPagination) {
      this.widgetTimewindowChanged$ = this.ctx.defaultSubscription.widgetTimewindowChanged$.subscribe(
        () => this.pageLink.page = 0
      );
      this.widgetResize$ = new ResizeObserver(() => {
        const showHidePageSize = this.elementRef.nativeElement.offsetWidth < hidePageSizePixelValue;
        if (showHidePageSize !== this.hidePageSize) {
          this.hidePageSize = showHidePageSize;
          this.cd.markForCheck();
        }
      });
      this.widgetResize$.observe(this.elementRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (this.widgetTimewindowChanged$) {
      this.widgetTimewindowChanged$.unsubscribe();
      this.widgetTimewindowChanged$ = null;
    }
    if (this.widgetResize$) {
      this.widgetResize$.disconnect();
    }
  }

  ngAfterViewInit(): void {
    fromEvent(this.searchInputField.nativeElement, 'keyup')
      .pipe(
        debounceTime(150),
        distinctUntilChanged(),
        tap(() => {
          if (this.displayPagination) {
            this.paginator.pageIndex = 0;
          }
          this.updateData();
        })
      )
      .subscribe();

    if (this.displayPagination) {
      this.sort.sortChange.subscribe(() => this.paginator.pageIndex = 0);
    }
    ((this.displayPagination ? merge(this.sort.sortChange, this.paginator.page) : this.sort.sortChange) as Observable<any>)
      .pipe(
        tap(() => this.updateData())
      )
      .subscribe();
    this.updateData();
  }

  public onDataUpdated() {
    this.updateTitle(true);
    this.alarmsDatasource.updateAlarms();
    this.clearCache();
    this.ctx.detectChanges();
  }

  public pageLinkSortDirection(): SortDirection {
    return entityDataPageLinkSortDirection(this.pageLink);
  }

  private initializeConfig() {
    this.ctx.widgetActions = [this.searchAction, this.alarmFilterAction, this.columnDisplayAction];

    this.displayDetails = isDefined(this.settings.displayDetails) ? this.settings.displayDetails : true;
    this.allowAcknowledgment = isDefined(this.settings.allowAcknowledgment) ? this.settings.allowAcknowledgment : true;
    this.allowClear = isDefined(this.settings.allowClear) ? this.settings.allowClear : true;

    if (this.settings.alarmsTitle && this.settings.alarmsTitle.length) {
      this.alarmsTitlePattern = this.utils.customTranslation(this.settings.alarmsTitle, this.settings.alarmsTitle);
    } else {
      this.alarmsTitlePattern = this.translate.instant('alarm.alarms');
    }

    this.updateTitle(false);

    this.enableSelection = isDefined(this.settings.enableSelection) ? this.settings.enableSelection : true;
    if (!this.allowAcknowledgment && !this.allowClear) {
      this.enableSelection = false;
    }

    this.searchAction.show = isDefined(this.settings.enableSearch) ? this.settings.enableSearch : true;
    this.displayPagination = isDefined(this.settings.displayPagination) ? this.settings.displayPagination : true;
    this.enableStickyHeader = isDefined(this.settings.enableStickyHeader) ? this.settings.enableStickyHeader : true;
    this.enableStickyAction = isDefined(this.settings.enableStickyAction) ? this.settings.enableStickyAction : false;
    this.columnDisplayAction.show = isDefined(this.settings.enableSelectColumnDisplay) ? this.settings.enableSelectColumnDisplay : true;
    let enableFilter;
    if (isDefined(this.settings.enableFilter)) {
      enableFilter = this.settings.enableFilter;
    } else if (isDefined(this.settings.enableStatusFilter)) {
      enableFilter = this.settings.enableStatusFilter;
    } else {
      enableFilter = true;
    }
    this.alarmFilterAction.show = enableFilter;

    this.rowStylesInfo = getRowStyleInfo(this.settings, 'alarm, ctx');

    const pageSize = this.settings.defaultPageSize;
    if (isDefined(pageSize) && isNumber(pageSize) && pageSize > 0) {
      this.defaultPageSize = pageSize;
    }
    this.pageSizeOptions = [this.defaultPageSize, this.defaultPageSize * 2, this.defaultPageSize * 3];
    this.pageLink.pageSize = this.displayPagination ? this.defaultPageSize : 1024;

    this.pageLink.searchPropagatedAlarms = isDefined(this.widgetConfig.searchPropagatedAlarms)
      ? this.widgetConfig.searchPropagatedAlarms : true;
    let alarmStatusList: AlarmSearchStatus[] = [];
    if (isDefined(this.widgetConfig.alarmStatusList) && this.widgetConfig.alarmStatusList.length) {
      alarmStatusList = this.widgetConfig.alarmStatusList;
    } else if (isDefined(this.widgetConfig.alarmSearchStatus) && this.widgetConfig.alarmSearchStatus !== AlarmSearchStatus.ANY) {
      alarmStatusList = [this.widgetConfig.alarmSearchStatus];
    }
    this.pageLink.statusList = alarmStatusList;
    this.pageLink.severityList = isDefined(this.widgetConfig.alarmSeverityList) ? this.widgetConfig.alarmSeverityList : [];
    this.pageLink.typeList = isDefined(this.widgetConfig.alarmTypeList) ? this.widgetConfig.alarmTypeList : [];

    this.noDataDisplayMessageText =
      noDataMessage(this.widgetConfig.noDataDisplayMessage, 'alarm.no-alarms-prompt', this.utils, this.translate);

    const cssString = constructTableCssString(this.widgetConfig);
    const cssParser = new cssjs();
    cssParser.testMode = false;
    const namespace = 'alarms-table-' + hashCode(cssString);
    cssParser.cssPreviewNamespace = namespace;
    cssParser.createStyleElement(namespace, cssString);
    $(this.elementRef.nativeElement).addClass(namespace);
  }

  private updateTitle(updateWidgetParams = false) {
    const newTitle = createLabelFromDatasource(this.subscription.alarmSource, this.alarmsTitlePattern);
    if (this.ctx.widgetTitle !== newTitle) {
      this.ctx.widgetTitle = newTitle;
      if (updateWidgetParams) {
        this.ctx.updateWidgetParams();
      }
    }
  }

  private updateAlarmSource() {

    if (this.enableSelection) {
      this.displayedColumns.push('select');
    }

    const latestDataKeys: Array<DataKey> = [];

    if (this.subscription.alarmSource) {
      this.subscription.alarmSource.dataKeys.forEach((alarmDataKey) => {
        const dataKey: EntityColumn = deepClone(alarmDataKey) as EntityColumn;
        dataKey.entityKey = dataKeyToEntityKey(alarmDataKey);
        dataKey.label = this.utils.customTranslation(dataKey.label, dataKey.label);
        dataKey.title = dataKey.label;
        dataKey.def = 'def' + this.columns.length;
        const keySettings: TableWidgetDataKeySettings = dataKey.settings;
        if (dataKey.type === DataKeyType.alarm && !isDefined(keySettings.columnWidth)) {
          const alarmField = alarmFields[dataKey.name];
          if (alarmField && alarmField.time) {
            keySettings.columnWidth = '120px';
          }
        }
        this.stylesInfo[dataKey.def] = getCellStyleInfo(keySettings, 'value, alarm, ctx');
        this.contentsInfo[dataKey.def] = getCellContentInfo(keySettings, 'value, alarm, ctx');
        this.contentsInfo[dataKey.def].units = dataKey.units;
        this.contentsInfo[dataKey.def].decimals = dataKey.decimals;
        this.columnWidth[dataKey.def] = getColumnWidth(keySettings);
        this.columnDefaultVisibility[dataKey.def] = getColumnDefaultVisibility(keySettings);
        this.columnSelectionAvailability[dataKey.def] = getColumnSelectionAvailability(keySettings);
        this.columns.push(dataKey);

        if (dataKey.type !== DataKeyType.alarm) {
          latestDataKeys.push(dataKey);
        }
      });
      this.displayedColumns.push(...this.columns.filter(column => this.columnDefaultVisibility[column.def])
        .map(column => column.def));
    }
    if (this.settings.defaultSortOrder && this.settings.defaultSortOrder.length) {
      this.defaultSortOrder = this.utils.customTranslation(this.settings.defaultSortOrder, this.settings.defaultSortOrder);
    }
    this.pageLink.sortOrder = entityDataSortOrderFromString(this.defaultSortOrder, this.columns);
    let sortColumn: EntityColumn;
    if (this.pageLink.sortOrder) {
      sortColumn = findColumnByEntityKey(this.pageLink.sortOrder.key, this.columns);
    }
    this.sortOrderProperty = sortColumn ? sortColumn.def : null;

    const actionCellDescriptors: AlarmWidgetActionDescriptor[] = [];
    if (this.displayDetails) {
      actionCellDescriptors.push(
        {
          displayName: this.translate.instant('alarm.details'),
          icon: 'more_horiz',
          details: true
        } as AlarmWidgetActionDescriptor
      );
    }

    if (this.allowAcknowledgment) {
      actionCellDescriptors.push(
        {
          displayName: this.translate.instant('alarm.acknowledge'),
          icon: 'done',
          acknowledge: true
        } as AlarmWidgetActionDescriptor
      );
    }

    if (this.allowClear) {
      actionCellDescriptors.push(
        {
          displayName: this.translate.instant('alarm.clear'),
          icon: 'clear',
          clear: true
        } as AlarmWidgetActionDescriptor
      );
    }

    this.setCellButtonAction = !!(actionCellDescriptors.length + this.ctx.actionsApi.getActionDescriptors('actionCellButton').length);

    if (this.setCellButtonAction) {
      this.displayedColumns.push('actions');
    }

    this.alarmsDatasource = new AlarmsDatasource(this.subscription, latestDataKeys, this.ngZone, this.ctx, actionCellDescriptors);
    if (this.enableSelection) {
      this.alarmsDatasource.selectionModeChanged$.subscribe((selectionMode) => {
        const hideTitlePanel = selectionMode || this.textSearchMode;
        if (this.ctx.hideTitlePanel !== hideTitlePanel) {
          this.ctx.hideTitlePanel = hideTitlePanel;
          this.ctx.detectChanges(true);
        } else {
          this.ctx.detectChanges();
        }
      });
    }
  }

  private editColumnsToDisplay($event: Event) {
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

    const columns: DisplayColumn[] = this.columns.map(column => {
      return {
        title: column.title,
        def: column.def,
        display: this.displayedColumns.indexOf(column.def) > -1,
        selectable: this.columnSelectionAvailability[column.def]
      };
    });

    const providers: StaticProvider[] = [
      {
        provide: DISPLAY_COLUMNS_PANEL_DATA,
        useValue: {
          columns,
          columnsUpdated: (newColumns) => {
            this.displayedColumns = newColumns.filter(column => column.display).map(column => column.def);
            if (this.enableSelection) {
              this.displayedColumns.unshift('select');
            }
            if (this.setCellButtonAction) {
              this.displayedColumns.push('actions');
            }
            this.clearCache();
          }
        } as DisplayColumnsPanelData
      },
      {
        provide: OverlayRef,
        useValue: overlayRef
      }
    ];
    const injector = Injector.create({parent: this.viewContainerRef.injector, providers});
    overlayRef.attach(new ComponentPortal(DisplayColumnsPanelComponent,
      this.viewContainerRef, injector));
    this.ctx.detectChanges();
  }

  private editAlarmFilter($event: Event) {
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
        provide: ALARM_FILTER_PANEL_DATA,
        useValue: {
          statusList: this.pageLink.statusList,
          severityList: this.pageLink.severityList,
          typeList: this.pageLink.typeList
        } as AlarmFilterPanelData
      },
      {
        provide: OverlayRef,
        useValue: overlayRef
      }
    ];
    const injector = Injector.create({parent: this.viewContainerRef.injector, providers});
    const componentRef = overlayRef.attach(new ComponentPortal(AlarmFilterPanelComponent,
      this.viewContainerRef, injector));
    componentRef.onDestroy(() => {
      if (componentRef.instance.result) {
        const result = componentRef.instance.result;
        this.pageLink.statusList = result.statusList;
        this.pageLink.severityList = result.severityList;
        this.pageLink.typeList = result.typeList;
        this.updateData();
      }
    });
    this.ctx.detectChanges();
  }

  private enterFilterMode() {
    this.textSearchMode = true;
    this.pageLink.textSearch = '';
    this.ctx.hideTitlePanel = true;
    this.ctx.detectChanges(true);
    setTimeout(() => {
      this.searchInputField.nativeElement.focus();
      this.searchInputField.nativeElement.setSelectionRange(0, 0);
    }, 10);
  }

  exitFilterMode() {
    this.textSearchMode = false;
    this.pageLink.textSearch = null;
    if (this.displayPagination) {
      this.paginator.pageIndex = 0;
    }
    this.updateData();
    this.ctx.hideTitlePanel = false;
    this.ctx.detectChanges(true);
  }

  private updateData() {
    if (this.displayPagination) {
      this.pageLink.page = this.paginator.pageIndex;
      this.pageLink.pageSize = this.paginator.pageSize;
    } else {
      this.pageLink.page = 0;
    }
    const key = findEntityKeyByColumnDef(this.sort.active, this.columns);
    if (key) {
      this.pageLink.sortOrder = {
        key,
        direction: Direction[this.sort.direction.toUpperCase()]
      };
    } else {
      this.pageLink.sortOrder = null;
    }
    const sortOrderLabel = fromEntityColumnDef(this.sort.active, this.columns);
    const keyFilters: KeyFilter[] = null; // TODO:
    this.alarmsDatasource.loadAlarms(this.pageLink, sortOrderLabel, keyFilters);
    this.ctx.detectChanges();
  }

  public trackByColumnDef(index, column: EntityColumn) {
    return column.def;
  }

  public trackByAlarmId(index: number, alarm: AlarmData) {
    return alarm.id.id;
  }

  public trackByActionCellDescriptionId(index: number, action: WidgetActionDescriptor) {
    return action.id;
  }

  public headerStyle(key: EntityColumn): any {
    const columnWidth = this.columnWidth[key.def];
    return widthStyle(columnWidth);
  }

  public rowStyle(alarm: AlarmDataInfo, row: number): any {
    let res = this.rowStyleCache[row];
    if (!res) {
      res = {};
      if (alarm && this.rowStylesInfo.useRowStyleFunction && this.rowStylesInfo.rowStyleFunction) {
        try {
          res = this.rowStylesInfo.rowStyleFunction(alarm, this.ctx);
          if (!isObject(res)) {
            throw new TypeError(`${res === null ? 'null' : typeof res} instead of style object`);
          }
          if (Array.isArray(res)) {
            throw new TypeError(`Array instead of style object`);
          }
        } catch (e) {
          res = {};
          console.warn(`Row style function in widget '${this.ctx.widgetTitle}' ` +
            `returns '${e}'. Please check your row style function.`);
        }
      }
      this.rowStyleCache[row] = res;
    }
    return res;
  }

  public cellStyle(alarm: AlarmDataInfo, key: EntityColumn, row: number): any {
    const col = this.columns.indexOf(key);
    const index = row * this.columns.length + col;
    let res = this.cellStyleCache[index];
    if (!res) {
      res = {};
      if (alarm && key) {
        const styleInfo = this.stylesInfo[key.def];
        const value = getAlarmValue(alarm, key);
        if (styleInfo.useCellStyleFunction && styleInfo.cellStyleFunction) {
          try {
            res = styleInfo.cellStyleFunction(value, alarm, this.ctx);
            if (!isObject(res)) {
              throw new TypeError(`${res === null ? 'null' : typeof res} instead of style object`);
            }
            if (Array.isArray(res)) {
              throw new TypeError(`Array instead of style object`);
            }
          } catch (e) {
            res = {};
            console.warn(`Cell style function for data key '${key.label}' in widget '${this.ctx.widgetTitle}' ` +
              `returns '${e}'. Please check your cell style function.`);
          }
        } else {
          res = this.defaultStyle(key, value);
        }
      }
      this.cellStyleCache[index] = res;
    }
    if (!res.width) {
      const columnWidth = this.columnWidth[key.def];
      res = Object.assign(res, widthStyle(columnWidth));
    }
    return res;
  }

  public cellContent(alarm: AlarmDataInfo, key: EntityColumn, row: number): SafeHtml {
    const col = this.columns.indexOf(key);
    const index = row * this.columns.length + col;
    let res = this.cellContentCache[index];
    if (isUndefined(res)) {
      res = '';
      if (alarm && key) {
        const contentInfo = this.contentsInfo[key.def];
        const value = getAlarmValue(alarm, key);
        let content = '';
        if (contentInfo.useCellContentFunction && contentInfo.cellContentFunction) {
          try {
            content = contentInfo.cellContentFunction(value, alarm, this.ctx);
          } catch (e) {
            content = '' + value;
          }
        } else {
          content = this.defaultContent(key, contentInfo, value);
        }

        if (isDefined(content)) {
          content = this.utils.customTranslation(content, content);
          switch (typeof content) {
            case 'string':
              res = this.domSanitizer.bypassSecurityTrustHtml(content);
              break;
            default:
              res = content;
          }
        }
      }
      this.cellContentCache[index] = res;
    }
    return res;
  }

  public onRowClick($event: Event, alarm: AlarmDataInfo) {
    if ($event) {
      $event.stopPropagation();
    }
    this.alarmsDatasource.toggleCurrentAlarm(alarm);
    const descriptors = this.ctx.actionsApi.getActionDescriptors('rowClick');
    if (descriptors.length) {
      let entityId;
      let entityName;
      if (alarm && alarm.originator) {
        entityId = alarm.originator;
        entityName = alarm.originatorName;
      }
      this.ctx.actionsApi.handleWidgetAction($event, descriptors[0], entityId, entityName, {alarm});
    }
  }

  public onActionButtonClick($event: Event, alarm: AlarmDataInfo, actionDescriptor: AlarmWidgetActionDescriptor) {
    if (actionDescriptor.details) {
      this.openAlarmDetails($event, alarm);
    } else if (actionDescriptor.acknowledge) {
      this.ackAlarm($event, alarm);
    } else if (actionDescriptor.clear) {
      this.clearAlarm($event, alarm);
    } else {
      if ($event) {
        $event.stopPropagation();
      }
      let entityId;
      let entityName;
      if (alarm && alarm.originator) {
        entityId = alarm.originator;
        entityName = alarm.originatorName;
      }
      this.ctx.actionsApi.handleWidgetAction($event, actionDescriptor, entityId, entityName, {alarm});
    }
  }

  public actionEnabled(alarm: AlarmDataInfo, actionDescriptor: AlarmWidgetActionDescriptor): boolean {
    if (actionDescriptor.acknowledge) {
      return (alarm.status === AlarmStatus.ACTIVE_UNACK ||
        alarm.status === AlarmStatus.CLEARED_UNACK);
    } else if (actionDescriptor.clear) {
      return (alarm.status === AlarmStatus.ACTIVE_ACK ||
        alarm.status === AlarmStatus.ACTIVE_UNACK);
    }
    return true;
  }

  private openAlarmDetails($event: Event, alarm: AlarmDataInfo) {
    if ($event) {
      $event.stopPropagation();
    }
    if (alarm && alarm.id && alarm.id.id !== NULL_UUID) {
      this.dialog.open<AlarmDetailsDialogComponent, AlarmDetailsDialogData, boolean>
      (AlarmDetailsDialogComponent,
        {
          disableClose: true,
          panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
          data: {
            alarmId: alarm.id.id,
            allowAcknowledgment: this.allowAcknowledgment,
            allowClear: this.allowClear,
            displayDetails: true
          }
        }).afterClosed().subscribe(
        (res) => {
          if (res) {
            this.subscription.update();
          }
        }
      );
    }
  }

  private ackAlarm($event: Event, alarm: AlarmDataInfo) {
    if ($event) {
      $event.stopPropagation();
    }
    if (alarm && alarm.id && alarm.id.id !== NULL_UUID) {
      this.dialogService.confirm(
        this.translate.instant('alarm.aknowledge-alarm-title'),
        this.translate.instant('alarm.aknowledge-alarm-text'),
        this.translate.instant('action.no'),
        this.translate.instant('action.yes')
      ).subscribe((res) => {
        if (res) {
          if (res) {
            this.alarmService.ackAlarm(alarm.id.id).subscribe(() => {
              this.subscription.update();
            });
          }
        }
      });
    }
  }

  public ackAlarms($event: Event) {
    if ($event) {
      $event.stopPropagation();
    }
    if (this.alarmsDatasource.selection.hasValue()) {
      const alarmIds = this.alarmsDatasource.selection.selected.filter(
        (alarmId) => alarmId !== NULL_UUID
      );
      if (alarmIds.length) {
        const title = this.translate.instant('alarm.aknowledge-alarms-title', {count: alarmIds.length});
        const content = this.translate.instant('alarm.aknowledge-alarms-text', {count: alarmIds.length});
        this.dialogService.confirm(
          title,
          content,
          this.translate.instant('action.no'),
          this.translate.instant('action.yes')
        ).subscribe((res) => {
          if (res) {
            if (res) {
              const tasks: Observable<void>[] = [];
              for (const alarmId of alarmIds) {
                tasks.push(this.alarmService.ackAlarm(alarmId));
              }
              forkJoin(tasks).subscribe(() => {
                this.alarmsDatasource.clearSelection();
                this.subscription.update();
              });
            }
          }
        });
      }
    }
  }

  private clearAlarm($event: Event, alarm: AlarmDataInfo) {
    if ($event) {
      $event.stopPropagation();
    }
    if (alarm && alarm.id && alarm.id.id !== NULL_UUID) {
      this.dialogService.confirm(
        this.translate.instant('alarm.clear-alarm-title'),
        this.translate.instant('alarm.clear-alarm-text'),
        this.translate.instant('action.no'),
        this.translate.instant('action.yes')
      ).subscribe((res) => {
        if (res) {
          if (res) {
            this.alarmService.clearAlarm(alarm.id.id).subscribe(() => {
              this.subscription.update();
            });
          }
        }
      });
    }
  }

  public clearAlarms($event: Event) {
    if ($event) {
      $event.stopPropagation();
    }
    if (this.alarmsDatasource.selection.hasValue()) {
      const alarmIds = this.alarmsDatasource.selection.selected.filter(
        (alarmId) => alarmId !== NULL_UUID
      );
      if (alarmIds.length) {
        const title = this.translate.instant('alarm.clear-alarms-title', {count: alarmIds.length});
        const content = this.translate.instant('alarm.clear-alarms-text', {count: alarmIds.length});
        this.dialogService.confirm(
          title,
          content,
          this.translate.instant('action.no'),
          this.translate.instant('action.yes')
        ).subscribe((res) => {
          if (res) {
            if (res) {
              const tasks: Observable<void>[] = [];
              for (const alarmId of alarmIds) {
                tasks.push(this.alarmService.clearAlarm(alarmId));
              }
              forkJoin(tasks).subscribe(() => {
                this.alarmsDatasource.clearSelection();
                this.subscription.update();
              });
            }
          }
        });
      }
    }
  }

  private defaultContent(key: EntityColumn, contentInfo: CellContentInfo, value: any): any {
    if (isDefined(value)) {
      const alarmField = alarmFields[key.name];
      if (alarmField) {
        if (alarmField.time) {
          return value ? this.datePipe.transform(value, 'yyyy-MM-dd HH:mm:ss') : '';
        } else if (alarmField.value === alarmFields.severity.value) {
          return this.translate.instant(alarmSeverityTranslations.get(value));
        } else if (alarmField.value === alarmFields.status.value) {
          return this.translate.instant(alarmStatusTranslations.get(value));
        } else if (alarmField.value === alarmFields.originatorType.value) {
          return this.translate.instant(entityTypeTranslations.get(value).type);
        } else {
          return value;
        }
      }
      const entityField = entityFields[key.name];
      if (entityField) {
        if (entityField.time) {
          return this.datePipe.transform(value, 'yyyy-MM-dd HH:mm:ss');
        }
      }
      const decimals = (contentInfo.decimals || contentInfo.decimals === 0) ? contentInfo.decimals : this.ctx.widgetConfig.decimals;
      const units = contentInfo.units || this.ctx.widgetConfig.units;
      return this.ctx.utils.formatValue(value, decimals, units, true);
    } else {
      return '';
    }
  }

  private defaultStyle(key: EntityColumn, value: any): any {
    if (isDefined(value)) {
      const alarmField = alarmFields[key.name];
      if (alarmField) {
        if (alarmField.value === alarmFields.severity.value) {
          return {
            fontWeight: 'bold',
            color: alarmSeverityColors.get(value)
          };
        } else {
          return {};
        }
      } else {
        return {};
      }
    } else {
      return {};
    }
  }

  isSorting(column: EntityColumn): boolean {
    return column.type === DataKeyType.alarm && column.name.startsWith('details.');
  }

  private clearCache() {
    this.cellContentCache.length = 0;
    this.cellStyleCache.length = 0;
    this.rowStyleCache.length = 0;
  }
}

class AlarmsDatasource implements DataSource<AlarmDataInfo> {

  private alarmsSubject = new BehaviorSubject<AlarmDataInfo[]>([]);
  private pageDataSubject = new BehaviorSubject<PageData<AlarmDataInfo>>(emptyPageData<AlarmDataInfo>());

  public selection = new SelectionModel<string>(true, [], false);

  private selectionModeChanged = new EventEmitter<boolean>();

  public selectionModeChanged$ = this.selectionModeChanged.asObservable();

  private currentAlarm: AlarmDataInfo = null;

  public dataLoading = true;
  public countCellButtonAction = 0;

  private appliedPageLink: AlarmDataPageLink;
  private appliedSortOrderLabel: string;

  private reserveSpaceForHiddenAction = true;
  private cellButtonActions: TableCellButtonActionDescriptor[];
  private readonly usedShowCellActionFunction: boolean;

  constructor(private subscription: IWidgetSubscription,
              private dataKeys: Array<DataKey>,
              private ngZone: NgZone,
              private widgetContext: WidgetContext,
              actionCellDescriptors: AlarmWidgetActionDescriptor[]) {
    this.cellButtonActions = actionCellDescriptors.concat(getTableCellButtonActions(widgetContext));
    this.usedShowCellActionFunction = this.cellButtonActions.some(action => action.useShowActionCellButtonFunction);
    if (this.widgetContext.settings.reserveSpaceForHiddenAction) {
      this.reserveSpaceForHiddenAction = coerceBooleanProperty(this.widgetContext.settings.reserveSpaceForHiddenAction);
    }
  }

  connect(collectionViewer: CollectionViewer): Observable<AlarmDataInfo[] | ReadonlyArray<AlarmDataInfo>> {
    return this.alarmsSubject.asObservable();
  }

  disconnect(collectionViewer: CollectionViewer): void {
    this.alarmsSubject.complete();
    this.pageDataSubject.complete();
  }

  loadAlarms(pageLink: AlarmDataPageLink, sortOrderLabel: string, keyFilters: KeyFilter[]) {
    this.dataLoading = true;
    // this.clear();
    this.appliedPageLink = pageLink;
    this.appliedSortOrderLabel = sortOrderLabel;
    this.subscription.subscribeForAlarms(pageLink, keyFilters);
  }

  private clear() {
    if (this.selection.hasValue()) {
      this.selection.clear();
      this.onSelectionModeChanged(false);
    }
    this.alarmsSubject.next([]);
    this.pageDataSubject.next(emptyPageData<AlarmDataInfo>());
  }

  updateAlarms() {
    const subscriptionAlarms = this.subscription.alarms;
    let alarms = new Array<AlarmDataInfo>();
    let maxCellButtonAction = 0;
    let isEmptySelection = false;
    const dynamicWidthCellButtonActions = this.usedShowCellActionFunction && !this.reserveSpaceForHiddenAction;
    subscriptionAlarms.data.forEach((alarmData) => {
      const alarm = this.alarmDataToInfo(alarmData);
      alarms.push(alarm);
      if (dynamicWidthCellButtonActions && alarm.actionCellButtons.length > maxCellButtonAction) {
        maxCellButtonAction = alarm.actionCellButtons.length;
      }
    });
    if (!dynamicWidthCellButtonActions && this.cellButtonActions.length && alarms.length) {
      maxCellButtonAction = alarms[0].actionCellButtons.length;
    }
    if (this.appliedSortOrderLabel && this.appliedSortOrderLabel.length) {
      const asc = this.appliedPageLink.sortOrder.direction === Direction.ASC;
      alarms = alarms.sort((a, b) => sortItems(a, b, this.appliedSortOrderLabel, asc));
    }
    if (this.selection.hasValue()) {
      const alarmIds = alarms.map((alarm) => alarm.id.id);
      const toRemove = this.selection.selected.filter(alarmId => alarmIds.indexOf(alarmId) === -1);
      this.selection.deselect(...toRemove);
      if (this.selection.isEmpty()) {
        isEmptySelection = true;
      }
    }
    const alarmsPageData: PageData<AlarmDataInfo> = {
      data: alarms,
      totalPages: subscriptionAlarms.totalPages,
      totalElements: subscriptionAlarms.totalElements,
      hasNext: subscriptionAlarms.hasNext
    };
    this.ngZone.run(() => {
      if (isEmptySelection) {
        this.onSelectionModeChanged(false);
      }
      this.alarmsSubject.next(alarms);
      this.pageDataSubject.next(alarmsPageData);
      this.countCellButtonAction = maxCellButtonAction;
      this.dataLoading = false;
    });
  }

  private alarmDataToInfo(alarmData: AlarmData): AlarmDataInfo {
    const alarm: AlarmDataInfo = deepClone(alarmData);
    delete alarm.latest;
    const latest = alarmData.latest;
    this.dataKeys.forEach((dataKey, index) => {
      const type = dataKeyTypeToEntityKeyType(dataKey.type);
      let value = '';
      if (type) {
        if (latest && latest[type]) {
          const tsVal = latest[type][dataKey.name];
          if (tsVal) {
            value = tsVal.value;
          }
        }
      }
      alarm[dataKey.label] = value;
    });
    if (this.cellButtonActions.length) {
      if (this.usedShowCellActionFunction) {
        alarm.actionCellButtons = prepareTableCellButtonActions(this.widgetContext, this.cellButtonActions,
                                                                alarm, this.reserveSpaceForHiddenAction);
        alarm.hasActions = checkHasActions(alarm.actionCellButtons);
      } else {
        alarm.actionCellButtons = this.cellButtonActions;
        alarm.hasActions = true;
      }
    }
    return alarm;
  }

  isAllSelected(): Observable<boolean> {
    const numSelected = this.selection.selected.length;
    return this.alarmsSubject.pipe(
      map((alarms) => numSelected === alarms.length)
    );
  }

  isEmpty(): Observable<boolean> {
    return this.alarmsSubject.pipe(
      map((alarms) => !alarms.length)
    );
  }

  total(): Observable<number> {
    return this.pageDataSubject.pipe(
      map((pageData) => pageData.totalElements)
    );
  }

  toggleSelection(alarm: AlarmDataInfo) {
    const hasValue = this.selection.hasValue();
    this.selection.toggle(alarm.id.id);
    if (hasValue !== this.selection.hasValue()) {
      this.onSelectionModeChanged(this.selection.hasValue());
    }
  }

  isSelected(alarm: AlarmDataInfo): boolean {
    return this.selection.isSelected(alarm.id.id);
  }

  clearSelection() {
    if (this.selection.hasValue()) {
      this.selection.clear();
      this.onSelectionModeChanged(false);
    }
  }

  masterToggle() {
    this.alarmsSubject.pipe(
      tap((alarms) => {
        const numSelected = this.selection.selected.length;
        if (numSelected === alarms.length) {
          this.selection.clear();
          if (numSelected > 0) {
            this.onSelectionModeChanged(false);
          }
        } else {
          alarms.forEach(row => {
            this.selection.select(row.id.id);
          });
          if (numSelected === 0) {
            this.onSelectionModeChanged(true);
          }
        }
      }),
      take(1)
    ).subscribe();
  }

  public toggleCurrentAlarm(alarm: AlarmDataInfo): boolean {
    if (this.currentAlarm !== alarm) {
      this.currentAlarm = alarm;
      return true;
    } else {
      return false;
    }
  }

  public isCurrentAlarm(alarm: AlarmDataInfo): boolean {
    return (this.currentAlarm && alarm && this.currentAlarm.id && alarm.id) &&
      (this.currentAlarm.id.id === alarm.id.id);
  }

  private onSelectionModeChanged(selectionMode: boolean) {
    this.selectionModeChanged.emit(selectionMode);
  }
}
