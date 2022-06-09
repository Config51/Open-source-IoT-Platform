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

import { Component, Inject, InjectionToken, OnInit, ViewContainerRef } from '@angular/core';
import {
  aggregationTranslations,
  AggregationType,
  DAY,
  HistoryWindowType,
  quickTimeIntervalPeriod,
  RealtimeWindowType,
  Timewindow,
  TimewindowType
} from '@shared/models/time/time.models';
import { OverlayRef } from '@angular/cdk/overlay';
import { PageComponent } from '@shared/components/page.component';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TimeService } from '@core/services/time.service';

export const TIMEWINDOW_PANEL_DATA = new InjectionToken<any>('TimewindowPanelData');

export interface TimewindowPanelData {
  historyOnly: boolean;
  timewindow: Timewindow;
  aggregation: boolean;
  timezone: boolean;
  isEdit: boolean;
}

@Component({
  selector: 'tb-timewindow-panel',
  templateUrl: './timewindow-panel.component.html',
  styleUrls: ['./timewindow-panel.component.scss']
})
export class TimewindowPanelComponent extends PageComponent implements OnInit {

  historyOnly = false;

  aggregation = false;

  timezone = false;

  isEdit = false;

  timewindow: Timewindow;

  result: Timewindow;

  timewindowForm: FormGroup;

  historyTypes = HistoryWindowType;

  realtimeTypes = RealtimeWindowType;

  timewindowTypes = TimewindowType;

  aggregationTypes = AggregationType;

  aggregations = Object.keys(AggregationType);

  aggregationTypesTranslations = aggregationTranslations;

  constructor(@Inject(TIMEWINDOW_PANEL_DATA) public data: TimewindowPanelData,
              public overlayRef: OverlayRef,
              protected store: Store<AppState>,
              public fb: FormBuilder,
              private timeService: TimeService,
              public viewContainerRef: ViewContainerRef) {
    super(store);
    this.historyOnly = data.historyOnly;
    this.timewindow = data.timewindow;
    this.aggregation = data.aggregation;
    this.timezone = data.timezone;
    this.isEdit = data.isEdit;
  }

  ngOnInit(): void {
    const hideInterval = this.timewindow.hideInterval || false;
    const hideAggregation = this.timewindow.hideAggregation || false;
    const hideAggInterval = this.timewindow.hideAggInterval || false;
    const hideTimezone = this.timewindow.hideTimezone || false;

    this.timewindowForm = this.fb.group({
        realtime: this.fb.group(
          {
            realtimeType: this.fb.control({
              value: this.timewindow.realtime && typeof this.timewindow.realtime.realtimeType !== 'undefined'
                ? this.timewindow.realtime.realtimeType : RealtimeWindowType.LAST_INTERVAL,
              disabled: hideInterval
            }),
            timewindowMs: [
              this.timewindow.realtime && typeof this.timewindow.realtime.timewindowMs !== 'undefined'
                ? this.timewindow.realtime.timewindowMs : null
            ],
            interval: [
              this.timewindow.realtime && typeof this.timewindow.realtime.interval !== 'undefined'
                ? this.timewindow.realtime.interval : null
            ],
            quickInterval: this.fb.control({
              value: this.timewindow.realtime && typeof this.timewindow.realtime.quickInterval !== 'undefined'
                ? this.timewindow.realtime.quickInterval : null,
              disabled: hideInterval
            })
          }
        ),
        history: this.fb.group(
          {
            historyType: this.fb.control({
              value: this.timewindow.history && typeof this.timewindow.history.historyType !== 'undefined'
                ? this.timewindow.history.historyType : HistoryWindowType.LAST_INTERVAL,
              disabled: hideInterval
            }),
            timewindowMs: this.fb.control({
              value: this.timewindow.history && typeof this.timewindow.history.timewindowMs !== 'undefined'
                ? this.timewindow.history.timewindowMs : null,
              disabled: hideInterval
            }),
            interval: [
              this.timewindow.history && typeof this.timewindow.history.interval !== 'undefined'
                ? this.timewindow.history.interval : null
            ],
            fixedTimewindow: this.fb.control({
              value: this.timewindow.history && typeof this.timewindow.history.fixedTimewindow !== 'undefined'
                ? this.timewindow.history.fixedTimewindow : null,
              disabled: hideInterval
            }),
            quickInterval: this.fb.control({
              value: this.timewindow.history && typeof this.timewindow.history.quickInterval !== 'undefined'
                ? this.timewindow.history.quickInterval : null,
              disabled: hideInterval
            })
          }
        ),
        aggregation: this.fb.group(
          {
            type: this.fb.control({
              value: this.timewindow.aggregation && typeof this.timewindow.aggregation.type !== 'undefined'
                ? this.timewindow.aggregation.type : null,
              disabled: hideAggregation
            }),
            limit: this.fb.control({
              value: this.timewindow.aggregation && typeof this.timewindow.aggregation.limit !== 'undefined'
                ? this.checkLimit(this.timewindow.aggregation.limit) : null,
              disabled: hideAggInterval
            }, [])
          }
        ),
        timezone: this.fb.control({
          value: this.timewindow.timezone !== 'undefined'
            ? this.timewindow.timezone : null,
          disabled: hideTimezone
        })
    });
    this.updateValidators();
    this.timewindowForm.get('aggregation.type').valueChanges.subscribe(() => {
      this.updateValidators();
    });
  }

  private checkLimit(limit?: number): number {
    if (!limit || limit < this.minDatapointsLimit()) {
      return this.minDatapointsLimit();
    } else if (limit > this.maxDatapointsLimit()) {
      return this.maxDatapointsLimit();
    }
    return limit;
  }

  private updateValidators() {
    const aggType = this.timewindowForm.get('aggregation.type').value;
    if (aggType !== AggregationType.NONE) {
      this.timewindowForm.get('aggregation.limit').clearValidators();
    } else {
      this.timewindowForm.get('aggregation.limit').setValidators([Validators.min(this.minDatapointsLimit()),
        Validators.max(this.maxDatapointsLimit())]);
    }
    this.timewindowForm.get('aggregation.limit').updateValueAndValidity({emitEvent: false});
  }

  update() {
    const timewindowFormValue = this.timewindowForm.getRawValue();
    this.timewindow.realtime = {
      realtimeType: timewindowFormValue.realtime.realtimeType,
      timewindowMs: timewindowFormValue.realtime.timewindowMs,
      quickInterval: timewindowFormValue.realtime.quickInterval,
      interval: timewindowFormValue.realtime.interval
    };
    this.timewindow.history = {
      historyType: timewindowFormValue.history.historyType,
      timewindowMs: timewindowFormValue.history.timewindowMs,
      interval: timewindowFormValue.history.interval,
      fixedTimewindow: timewindowFormValue.history.fixedTimewindow,
      quickInterval: timewindowFormValue.history.quickInterval,
    };
    if (this.aggregation) {
      this.timewindow.aggregation = {
        type: timewindowFormValue.aggregation.type,
        limit: timewindowFormValue.aggregation.limit
      };
    }
    if (this.timezone) {
      this.timewindow.timezone = timewindowFormValue.timezone;
    }
    this.result = this.timewindow;
    this.overlayRef.dispose();
  }

  cancel() {
    this.overlayRef.dispose();
  }

  minDatapointsLimit() {
    return this.timeService.getMinDatapointsLimit();
  }

  maxDatapointsLimit() {
    return this.timeService.getMaxDatapointsLimit();
  }

  minRealtimeAggInterval() {
    return this.timeService.minIntervalLimit(this.currentRealtimeTimewindow());
  }

  maxRealtimeAggInterval() {
    return this.timeService.maxIntervalLimit(this.currentRealtimeTimewindow());
  }

  currentRealtimeTimewindow(): number {
    const timeWindowFormValue = this.timewindowForm.getRawValue();
    switch (timeWindowFormValue.realtime.realtimeType) {
      case RealtimeWindowType.LAST_INTERVAL:
        return timeWindowFormValue.realtime.timewindowMs;
      case RealtimeWindowType.INTERVAL:
        return quickTimeIntervalPeriod(timeWindowFormValue.realtime.quickInterval);
      default:
        return DAY;
    }
  }

  minHistoryAggInterval() {
    return this.timeService.minIntervalLimit(this.currentHistoryTimewindow());
  }

  maxHistoryAggInterval() {
    return this.timeService.maxIntervalLimit(this.currentHistoryTimewindow());
  }

  currentHistoryTimewindow() {
    const timewindowFormValue = this.timewindowForm.getRawValue();
    if (timewindowFormValue.history.historyType === HistoryWindowType.LAST_INTERVAL) {
      return timewindowFormValue.history.timewindowMs;
    } else if (timewindowFormValue.history.historyType === HistoryWindowType.INTERVAL) {
      return quickTimeIntervalPeriod(timewindowFormValue.history.quickInterval);
    } else if (timewindowFormValue.history.fixedTimewindow) {
      return timewindowFormValue.history.fixedTimewindow.endTimeMs -
        timewindowFormValue.history.fixedTimewindow.startTimeMs;
    } else {
      return DAY;
    }
  }

  onHideIntervalChanged() {
    if (this.timewindow.hideInterval) {
      this.timewindowForm.get('history.historyType').disable({emitEvent: false});
      this.timewindowForm.get('history.timewindowMs').disable({emitEvent: false});
      this.timewindowForm.get('history.fixedTimewindow').disable({emitEvent: false});
      this.timewindowForm.get('history.quickInterval').disable({emitEvent: false});
      this.timewindowForm.get('realtime.realtimeType').disable({emitEvent: false});
      this.timewindowForm.get('realtime.timewindowMs').disable({emitEvent: false});
      this.timewindowForm.get('realtime.quickInterval').disable({emitEvent: false});
    } else {
      this.timewindowForm.get('history.historyType').enable({emitEvent: false});
      this.timewindowForm.get('history.timewindowMs').enable({emitEvent: false});
      this.timewindowForm.get('history.fixedTimewindow').enable({emitEvent: false});
      this.timewindowForm.get('history.quickInterval').enable({emitEvent: false});
      this.timewindowForm.get('realtime.realtimeType').enable({emitEvent: false});
      this.timewindowForm.get('realtime.timewindowMs').enable({emitEvent: false});
      this.timewindowForm.get('realtime.quickInterval').enable({emitEvent: false});
    }
    this.timewindowForm.markAsDirty();
  }

  onHideAggregationChanged() {
    if (this.timewindow.hideAggregation) {
      this.timewindowForm.get('aggregation.type').disable({emitEvent: false});
    } else {
      this.timewindowForm.get('aggregation.type').enable({emitEvent: false});
    }
    this.timewindowForm.markAsDirty();
  }

  onHideAggIntervalChanged() {
    if (this.timewindow.hideAggInterval) {
      this.timewindowForm.get('aggregation.limit').disable({emitEvent: false});
    } else {
      this.timewindowForm.get('aggregation.limit').enable({emitEvent: false});
    }
    this.timewindowForm.markAsDirty();
  }

  onHideTimezoneChanged() {
    if (this.timewindow.hideTimezone) {
      this.timewindowForm.get('timezone').disable({emitEvent: false});
    } else {
      this.timewindowForm.get('timezone').enable({emitEvent: false});
    }
    this.timewindowForm.markAsDirty();
  }

}
