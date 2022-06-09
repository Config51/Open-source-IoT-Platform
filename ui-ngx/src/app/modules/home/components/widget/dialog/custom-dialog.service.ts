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

import { Inject, Injectable, Type } from '@angular/core';
import { Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '@core/auth/auth.service';
import { DynamicComponentFactoryService } from '@core/services/dynamic-component-factory.service';
import { CommonModule } from '@angular/common';
import { mergeMap, tap } from 'rxjs/operators';
import { CustomDialogComponent } from './custom-dialog.component';
import {
  CustomDialogContainerComponent,
  CustomDialogContainerData
} from '@home/components/widget/dialog/custom-dialog-container.component';
import { SHARED_MODULE_TOKEN } from '@shared/components/tokens';
import { SHARED_HOME_COMPONENTS_MODULE_TOKEN } from '@home/components/tokens';

@Injectable()
export class CustomDialogService {

  constructor(
    private translate: TranslateService,
    private authService: AuthService,
    private dynamicComponentFactoryService: DynamicComponentFactoryService,
    @Inject(SHARED_MODULE_TOKEN) private sharedModule: Type<any>,
    @Inject(SHARED_HOME_COMPONENTS_MODULE_TOKEN) private sharedHomeComponentsModule: Type<any>,
    public dialog: MatDialog
  ) {
  }

  customDialog(template: string, controller: (instance: CustomDialogComponent) => void, data?: any): Observable<any> {
    return this.dynamicComponentFactoryService.createDynamicComponentFactory(
      class CustomDialogComponentInstance extends CustomDialogComponent {},
      template,
      [this.sharedModule, CommonModule, this.sharedHomeComponentsModule]).pipe(
      mergeMap((factory) => {
          const dialogData: CustomDialogContainerData = {
            controller,
            customComponentFactory: factory,
            data
          };
          return this.dialog.open<CustomDialogContainerComponent, CustomDialogContainerData, any>(
            CustomDialogContainerComponent,
            {
              disableClose: true,
              panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
              data: dialogData
            }).afterClosed().pipe(
            tap(() => {
              this.dynamicComponentFactoryService.destroyDynamicComponentFactory(factory);
            })
          );
        }
      ));
  }

}

