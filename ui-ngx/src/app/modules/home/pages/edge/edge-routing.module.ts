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

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EntitiesTableComponent } from '@home/components/entity/entities-table.component';
import { Authority } from '@shared/models/authority.enum';
import { EdgesTableConfigResolver } from '@home/pages/edge/edges-table-config.resolver';
import { AssetsTableConfigResolver } from '@home/pages/asset/assets-table-config.resolver';
import { DevicesTableConfigResolver } from '@home/pages/device/devices-table-config.resolver';
import { EntityViewsTableConfigResolver } from '@home/pages/entity-view/entity-views-table-config.resolver';
import { DashboardsTableConfigResolver } from '@home/pages/dashboard/dashboards-table-config.resolver';
import { RuleChainsTableConfigResolver } from '@home/pages/rulechain/rulechains-table-config.resolver';
import { DashboardPageComponent } from '@home/components/dashboard-page/dashboard-page.component';
import { dashboardBreadcumbLabelFunction, DashboardResolver } from '@home/pages/dashboard/dashboard-routing.module';
import { BreadCrumbConfig } from '@shared/components/breadcrumb';
import { RuleChainPageComponent } from '@home/pages/rulechain/rulechain-page.component';
import { ConfirmOnExitGuard } from '@core/guards/confirm-on-exit.guard';
import { RuleChainType } from '@shared/models/rule-chain.models';
import {
  importRuleChainBreadcumbLabelFunction,
  RuleChainMetaDataResolver,
  ruleChainBreadcumbLabelFunction,
  RuleChainImportGuard,
  RuleChainResolver,
  RuleNodeComponentsResolver,
  TooltipsterResolver
} from '@home/pages/rulechain/rulechain-routing.module';
import { EntityDetailsPageComponent } from '@home/components/entity/entity-details-page.component';
import { entityDetailsPageBreadcrumbLabelFunction } from '@home/pages/home-pages.models';

const routes: Routes = [
  {
    path: 'edgeInstances',
    data: {
      breadcrumb: {
        label: 'edge.edge-instances',
        icon: 'router'
      }
    },
    children: [
      {
        path: '',
        component: EntitiesTableComponent,
        data: {
          auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
          title: 'edge.edge-instances',
          edgesType: 'tenant'
        },
        resolve: {
          entitiesTableConfig: EdgesTableConfigResolver
        }
      },
      {
        path: ':entityId',
        component: EntityDetailsPageComponent,
        canDeactivate: [ConfirmOnExitGuard],
        data: {
          breadcrumb: {
            labelFunction: entityDetailsPageBreadcrumbLabelFunction,
            icon: 'router'
          } as BreadCrumbConfig<EntityDetailsPageComponent>,
          auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
          title: 'edge.edge-instances',
          edgesType: 'tenant'
        },
        resolve: {
          entitiesTableConfig: EdgesTableConfigResolver
        }
      },
      {
        path: ':edgeId/assets',
        data: {
          breadcrumb: {
            label: 'edge.assets',
            icon: 'domain'
          }
        },
        children: [
          {
            path: '',
            component: EntitiesTableComponent,
            data: {
              auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
              title: 'edge.assets',
              assetsType: 'edge'
            },
            resolve: {
              entitiesTableConfig: AssetsTableConfigResolver
            }
          },
          {
            path: ':entityId',
            component: EntityDetailsPageComponent,
            canDeactivate: [ConfirmOnExitGuard],
            data: {
              breadcrumb: {
                labelFunction: entityDetailsPageBreadcrumbLabelFunction,
                icon: 'domain'
              } as BreadCrumbConfig<EntityDetailsPageComponent>,
              auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
              title: 'edge.assets',
              assetsType: 'edge'
            },
            resolve: {
              entitiesTableConfig: AssetsTableConfigResolver
            }
          }
        ]
      },
      {
        path: ':edgeId/devices',
        data: {
          breadcrumb: {
            label: 'edge.devices',
            icon: 'devices_other'
          }
        },
        children: [
          {
            path: '',
            component: EntitiesTableComponent,
            data: {
              auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
              title: 'edge.devices',
              devicesType: 'edge'
            },
            resolve: {
              entitiesTableConfig: DevicesTableConfigResolver
            }
          },
          {
            path: ':entityId',
            component: EntityDetailsPageComponent,
            canDeactivate: [ConfirmOnExitGuard],
            data: {
              breadcrumb: {
                labelFunction: entityDetailsPageBreadcrumbLabelFunction,
                icon: 'devices_other'
              } as BreadCrumbConfig<EntityDetailsPageComponent>,
              auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
              title: 'edge.devices',
              devicesType: 'edge'
            },
            resolve: {
              entitiesTableConfig: DevicesTableConfigResolver
            }
          }
        ]
      },
      {
        path: ':edgeId/entityViews',
        data: {
          breadcrumb: {
            label: 'edge.entity-views',
            icon: 'view_quilt'
          },
        },
        children: [
          {
            path: '',
            component: EntitiesTableComponent,
            data: {
              auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
              title: 'edge.entity-views',
              entityViewsType: 'edge'
            },
            resolve: {
              entitiesTableConfig: EntityViewsTableConfigResolver
            }
          },
          {
            path: ':entityId',
            component: EntityDetailsPageComponent,
            canDeactivate: [ConfirmOnExitGuard],
            data: {
              breadcrumb: {
                labelFunction: entityDetailsPageBreadcrumbLabelFunction,
                icon: 'devices_other'
              } as BreadCrumbConfig<EntityDetailsPageComponent>,
              auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
              title: 'edge.entity-views',
              entityViewsType: 'edge'
            },
            resolve: {
              entitiesTableConfig: EntityViewsTableConfigResolver
            }
          }
        ]
      },
      {
        path: ':edgeId/dashboards',
        data: {
          breadcrumb: {
            label: 'edge.dashboards',
            icon: 'dashboard'
          }
        },
        children: [
          {
            path: '',
            component: EntitiesTableComponent,
            data: {
              auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
              dashboardsType: 'edge'
            },
            resolve: {
              entitiesTableConfig: DashboardsTableConfigResolver
            },
          },
          {
            path: ':dashboardId',
            component: DashboardPageComponent,
            data: {
              breadcrumb: {
                labelFunction: dashboardBreadcumbLabelFunction,
                icon: 'dashboard'
              } as BreadCrumbConfig<DashboardPageComponent>,
              auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
              title: 'edge.dashboard',
              widgetEditMode: false
            },
            resolve: {
              dashboard: DashboardResolver
            }
          }
        ]
      },
      {
        path: ':edgeId/ruleChains',
        data: {
          breadcrumb: {
            label: 'edge.edge-rulechains',
            icon: 'settings_ethernet'
          }
        },
        children: [
          {
            path: '',
            component: EntitiesTableComponent,
            data: {
              auth: [Authority.TENANT_ADMIN],
              title: 'edge.rulechains',
              ruleChainsType: 'edge'
            },
            resolve: {
              entitiesTableConfig: RuleChainsTableConfigResolver
            }
          },
          {
            path: ':ruleChainId',
            component: RuleChainPageComponent,
            canDeactivate: [ConfirmOnExitGuard],
            data: {
              breadcrumb: {
                labelFunction: ruleChainBreadcumbLabelFunction,
                icon: 'settings_ethernet'
              } as BreadCrumbConfig<RuleChainPageComponent>,
              auth: [Authority.TENANT_ADMIN],
              title: 'rulechain.edge-rulechain',
              import: false,
              ruleChainType: RuleChainType.EDGE
            },
            resolve: {
              ruleChain: RuleChainResolver,
              ruleChainMetaData: RuleChainMetaDataResolver,
              ruleNodeComponents: RuleNodeComponentsResolver,
              tooltipster: TooltipsterResolver
            }
          }
        ]
      }
    ]
  },
  {
    path: 'edgeManagement',
    data: {
      breadcrumb: {
        label: 'edge.management',
        icon: 'settings_input_antenna'
      }
    },
    children: [
      {
        path: '',
        data: {
          auth: [Authority.TENANT_ADMIN, Authority.CUSTOMER_USER],
          redirectTo: '/edgeManagement/ruleChains'
        }
      },
      {
        path: 'ruleChains',
        data: {
          breadcrumb: {
            label: 'edge.rulechain-templates',
            icon: 'settings_ethernet'
          }
        },
        children: [
          {
            path: '',
            component: EntitiesTableComponent,
            data: {
              auth: [Authority.TENANT_ADMIN],
              title: 'edge.rulechain-templates',
              ruleChainsType: 'edges'
            },
            resolve: {
              entitiesTableConfig: RuleChainsTableConfigResolver
            }
          },
          {
            path: ':ruleChainId',
            component: RuleChainPageComponent,
            canDeactivate: [ConfirmOnExitGuard],
            data: {
              breadcrumb: {
                labelFunction: ruleChainBreadcumbLabelFunction,
                icon: 'settings_ethernet'
              } as BreadCrumbConfig<RuleChainPageComponent>,
              auth: [Authority.TENANT_ADMIN],
              title: 'rulechain.edge-rulechain',
              import: false,
              ruleChainType: RuleChainType.EDGE
            },
            resolve: {
              ruleChain: RuleChainResolver,
              ruleChainMetaData: RuleChainMetaDataResolver,
              ruleNodeComponents: RuleNodeComponentsResolver,
              tooltipster: TooltipsterResolver
            }
          },
          {
            path: 'ruleChain/import',
            component: RuleChainPageComponent,
            canActivate: [RuleChainImportGuard],
            canDeactivate: [ConfirmOnExitGuard],
            data: {
              breadcrumb: {
                labelFunction: importRuleChainBreadcumbLabelFunction,
                icon: 'settings_ethernet'
              } as BreadCrumbConfig<RuleChainPageComponent>,
              auth: [Authority.TENANT_ADMIN],
              title: 'rulechain.edge-rulechain',
              import: true,
              ruleChainType: RuleChainType.EDGE
            },
            resolve: {
              ruleNodeComponents: RuleNodeComponentsResolver,
              tooltipster: TooltipsterResolver
            }
          }
        ]
      }
    ]
  }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
  providers: [
    EdgesTableConfigResolver
  ]
})
export class EdgeRoutingModule {
}
