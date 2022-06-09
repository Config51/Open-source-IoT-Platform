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
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, ElementRef,
  EventEmitter, HostBinding, Inject,
  Input, OnDestroy,
  OnInit,
  Output, Renderer2, ViewChild
} from '@angular/core';
import { PageComponent } from '@shared/components/page.component';
import { DashboardWidget, DashboardWidgets } from '@home/models/dashboard-component.models';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { SafeStyle } from '@angular/platform-browser';
import { guid, hashCode, isNotEmptyStr } from '@core/utils';
import cssjs from '@core/css/css';
import { DOCUMENT } from '@angular/common';
import { GridsterItemComponent } from 'angular-gridster2';

export enum WidgetComponentActionType {
  MOUSE_DOWN,
  CLICKED,
  CONTEXT_MENU,
  EDIT,
  EXPORT,
  REMOVE
}

export class WidgetComponentAction {
  event: MouseEvent;
  actionType: WidgetComponentActionType;
}

// @dynamic
@Component({
  selector: 'tb-widget-container',
  templateUrl: './widget-container.component.html',
  styleUrls: ['./widget-container.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WidgetContainerComponent extends PageComponent implements OnInit, OnDestroy {

  @HostBinding('class')
  widgetContainerClass = 'tb-widget-container';

  @ViewChild('tbWidgetElement', {static: true})
  tbWidgetElement: ElementRef;

  @Input()
  gridsterItem: GridsterItemComponent;

  @Input()
  widget: DashboardWidget;

  @Input()
  dashboardStyle: {[klass: string]: any};

  @Input()
  backgroundImage: SafeStyle | string;

  @Input()
  isEdit: boolean;

  @Input()
  isMobile: boolean;

  @Input()
  dashboardWidgets: DashboardWidgets;

  @Input()
  isEditActionEnabled: boolean;

  @Input()
  isExportActionEnabled: boolean;

  @Input()
  isRemoveActionEnabled: boolean;

  @Input()
  disableWidgetInteraction = false;

  @Output()
  widgetFullscreenChanged: EventEmitter<boolean> = new EventEmitter<boolean>();

  @Output()
  widgetComponentAction: EventEmitter<WidgetComponentAction> = new EventEmitter<WidgetComponentAction>();

  private cssClass: string;

  constructor(protected store: Store<AppState>,
              private cd: ChangeDetectorRef,
              private renderer: Renderer2,
              @Inject(DOCUMENT) private document: Document) {
    super(store);
  }

  ngOnInit(): void {
    this.widget.widgetContext.containerChangeDetector = this.cd;
    const cssString = this.widget.widget.config.widgetCss;
    if (isNotEmptyStr(cssString)) {
      const cssParser = new cssjs();
      cssParser.testMode = false;
      this.cssClass = 'tb-widget-css-' + guid();
      this.renderer.addClass(this.gridsterItem.el, this.cssClass);
      cssParser.cssPreviewNamespace = this.cssClass;
      cssParser.createStyleElement(this.cssClass, cssString);
    }
  }

  ngOnDestroy(): void {
    if (this.cssClass) {
      const el = this.document.getElementById(this.cssClass);
      if (el) {
        el.parentNode.removeChild(el);
      }
    }
  }

  isHighlighted(widget: DashboardWidget) {
    return this.dashboardWidgets.isHighlighted(widget);
  }

  isNotHighlighted(widget: DashboardWidget) {
    return this.dashboardWidgets.isNotHighlighted(widget);
  }

  onFullscreenChanged(expanded: boolean) {
    if (expanded) {
      this.renderer.addClass(this.tbWidgetElement.nativeElement, this.cssClass);
    } else {
      this.renderer.removeClass(this.tbWidgetElement.nativeElement, this.cssClass);
    }
    this.widgetFullscreenChanged.emit(expanded);
  }

  onMouseDown(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.MOUSE_DOWN
    });
  }

  onClicked(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.CLICKED
    });
  }

  onContextMenu(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.CONTEXT_MENU
    });
  }

  onEdit(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.EDIT
    });
  }

  onExport(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.EXPORT
    });
  }

  onRemove(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.REMOVE
    });
  }

}
