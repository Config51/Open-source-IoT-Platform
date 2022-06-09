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

import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { EntityTableHeaderComponent } from '../../components/entity/entity-table-header.component';
import { EntityType } from '@shared/models/entity-type.models';
import { AssetInfo } from '@shared/models/asset.models';

@Component({
  selector: 'tb-asset-table-header',
  templateUrl: './asset-table-header.component.html',
  styleUrls: ['./asset-table-header.component.scss']
})
export class AssetTableHeaderComponent extends EntityTableHeaderComponent<AssetInfo> {

  entityType = EntityType;

  constructor(protected store: Store<AppState>) {
    super(store);
  }

  assetTypeChanged(assetType: string) {
    this.entitiesTableConfig.componentsData.assetType = assetType;
    this.entitiesTableConfig.getTable().resetSortAndFilter(true);
  }

}
