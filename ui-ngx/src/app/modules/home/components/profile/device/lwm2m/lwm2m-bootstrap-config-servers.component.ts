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

import { Component, EventEmitter, forwardRef, Input, OnInit, Output } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  FormArray,
  FormBuilder, FormControl,
  FormGroup,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR
} from '@angular/forms';
import { of, Subscription } from 'rxjs';
import { ServerSecurityConfig } from '@home/components/profile/device/lwm2m/lwm2m-profile-config.models';
import { TranslateService } from '@ngx-translate/core';
import { DialogService } from '@core/services/dialog.service';
import { MatDialog } from '@angular/material/dialog';
import { Lwm2mBootstrapAddConfigServerDialogComponent } from '@home/components/profile/device/lwm2m/lwm2m-bootstrap-add-config-server-dialog.component';
import { mergeMap } from 'rxjs/operators';
import { DeviceProfileService } from '@core/http/device-profile.service';
import { Lwm2mSecurityType } from '@shared/models/lwm2m-security-config.models';

@Component({
  selector: 'tb-profile-lwm2m-bootstrap-config-servers',
  templateUrl: './lwm2m-bootstrap-config-servers.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Lwm2mBootstrapConfigServersComponent),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => Lwm2mBootstrapConfigServersComponent),
      multi: true,
    }
  ]
})
export class Lwm2mBootstrapConfigServersComponent implements OnInit, ControlValueAccessor {

  bootstrapConfigServersFormGroup: FormGroup;

  @Input()
  disabled: boolean;

  @Input()
  isTransportWasRunWithBootstrap: boolean;

  @Output()
  isTransportWasRunWithBootstrapChange = new EventEmitter<boolean>();

  public isBootstrapServerUpdateEnableValue: boolean;
  @Input()
  set isBootstrapServerUpdateEnable(value: boolean) {
    this.isBootstrapServerUpdateEnableValue = value;
    if (!value) {
      this.removeBootstrapServerConfig();
    }
  }

  private valueChangeSubscription: Subscription = null;

  private propagateChange = (v: any) => { };

  constructor(public translate: TranslateService,
              public matDialog: MatDialog,
              private dialogService: DialogService,
              private deviceProfileService: DeviceProfileService,
              private fb: FormBuilder) {
  }

  registerOnChange(fn: any): void {
    this.propagateChange = fn;
  }

  registerOnTouched(fn: any): void {
  }

  ngOnInit() {
    this.bootstrapConfigServersFormGroup = this.fb.group({
      serverConfigs: this.fb.array([])
    });
  }

  serverConfigsFromArray(): FormArray {
    return this.bootstrapConfigServersFormGroup.get('serverConfigs') as FormArray;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (this.disabled) {
      this.bootstrapConfigServersFormGroup.disable({emitEvent: false});
    } else {
      this.bootstrapConfigServersFormGroup.enable({emitEvent: false});
    }
  }

  writeValue(serverConfigs: Array<ServerSecurityConfig> | null): void {
    if (this.valueChangeSubscription) {
      this.valueChangeSubscription.unsubscribe();
    }
    const serverConfigsControls: Array<AbstractControl> = [];
    if (serverConfigs) {
      serverConfigs.forEach((serverConfig) => {
        serverConfigsControls.push(this.fb.control(serverConfig));
      });
    }
    this.bootstrapConfigServersFormGroup.setControl('serverConfigs', this.fb.array(serverConfigsControls));
    if (this.disabled) {
      this.bootstrapConfigServersFormGroup.disable({emitEvent: false});
    } else {
      this.bootstrapConfigServersFormGroup.enable({emitEvent: false});
    }
    this.valueChangeSubscription = this.bootstrapConfigServersFormGroup.valueChanges.subscribe(() => {
      this.updateModel();
    });
  }

  trackByParams(index: number): number {
    return index;
  }

  removeServerConfig($event: Event, index: number) {
    if ($event) {
      $event.stopPropagation();
      $event.preventDefault();
    }
    this.dialogService.confirm(
      this.translate.instant('device-profile.lwm2m.delete-server-title'),
      this.translate.instant('device-profile.lwm2m.delete-server-text'),
      this.translate.instant('action.no'),
      this.translate.instant('action.yes'),
      true
    ).subscribe((result) => {
      if (result) {
        this.serverConfigsFromArray().removeAt(index);
      }
    });
  }

  addServerConfig(): void {
    const addDialogObs = this.isBootstrapServerNotAvailable() ? of(false) :
      this.matDialog.open<Lwm2mBootstrapAddConfigServerDialogComponent>(Lwm2mBootstrapAddConfigServerDialogComponent, {
        disableClose: true,
        panelClass: ['tb-dialog', 'tb-fullscreen-dialog']
      }).afterClosed();
    const addServerConfigObs = addDialogObs.pipe(
      mergeMap((isBootstrap) => {
        if (isBootstrap === null) {
          return of(null);
        }
        return this.deviceProfileService.getLwm2mBootstrapSecurityInfoBySecurityType(isBootstrap, Lwm2mSecurityType.NO_SEC);
      })
    );
    addServerConfigObs.subscribe((serverConfig) => {
      if (serverConfig) {
        serverConfig.securityMode = Lwm2mSecurityType.NO_SEC;
        this.serverConfigsFromArray().push(this.fb.control(serverConfig));
        this.updateModel();
      } else {
        this.isTransportWasRunWithBootstrap = false;
        this.isTransportWasRunWithBootstrapChange.emit(this.isTransportWasRunWithBootstrap);
      }
    });
  }

  updateIsTransportWasRunWithBootstrap(newValue: boolean): void {
    this.isTransportWasRunWithBootstrap = newValue;
    this.isTransportWasRunWithBootstrapChange.emit(this.isTransportWasRunWithBootstrap);
  }

  public validate(c: FormControl) {
    return (this.bootstrapConfigServersFormGroup.valid) ? null : {
      serverConfigs: {
        valid: false,
      },
    };
  }

  public isBootstrapServerNotAvailable(): boolean {
    return this.isBootstrapAdded() || !this.isBootstrapServerUpdateEnableValue || !this.isTransportWasRunWithBootstrap;
  }

  private isBootstrapAdded(): boolean {
    const serverConfigsArray =  this.serverConfigsFromArray().getRawValue();
    for (let i = 0; i < serverConfigsArray.length; i++) {
      if (serverConfigsArray[i].bootstrapServerIs) {
        return true;
      }
    }
    return false;
  }

  private removeBootstrapServerConfig(): void {
    if (this.bootstrapConfigServersFormGroup) {
      const bootstrapServerIndex = this.serverConfigsFromArray().getRawValue().findIndex(server => server.bootstrapServerIs === true);
      if (bootstrapServerIndex !== -1) {
        this.serverConfigsFromArray().removeAt(bootstrapServerIndex);
      }
    }
  }

  private updateModel() {
    const serverConfigs: Array<ServerSecurityConfig> = this.serverConfigsFromArray().value;
    this.propagateChange(serverConfigs);
  }
}
