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

import { defaultSettings, FormattedData, hereProviders, MapProviders, UnitedMapSettings } from './map-models';
import LeafletMap from './leaflet-map';
import {
  commonMapSettingsSchema,
  editorSettingSchema,
  mapCircleSchema,
  mapPolygonSchema,
  markerClusteringSettingsSchema,
  markerClusteringSettingsSchemaLeaflet,
  routeMapSettingsSchema
} from './schemes';
import { MapWidgetInterface, MapWidgetStaticInterface } from './map-widget.interface';
import { addCondition, addGroupInfo, addToSchema, initSchema, mergeSchemes } from '@core/schema-utils';
import { WidgetContext } from '@app/modules/home/models/widget-component.models';
import { getDefCenterPosition, getProviderSchema, parseFunction, parseWithTranslation } from './common-maps-utils';
import { Datasource, DatasourceData, JsonSettingsSchema, WidgetActionDescriptor } from '@shared/models/widget.models';
import { TranslateService } from '@ngx-translate/core';
import { UtilsService } from '@core/services/utils.service';
import { EntityDataPageLink } from '@shared/models/query/query.models';
import { providerClass } from '@home/components/widget/lib/maps/providers';
import { isDefined } from '@core/utils';
import L from 'leaflet';
import { forkJoin, Observable, of } from 'rxjs';
import { AttributeService } from '@core/http/attribute.service';
import { EntityId } from '@shared/models/id/entity-id';
import { AttributeScope, DataKeyType, LatestTelemetry } from '@shared/models/telemetry/telemetry.models';

// @dynamic
export class MapWidgetController implements MapWidgetInterface {

    constructor(
        public mapProvider: MapProviders,
        private drawRoutes: boolean,
        public ctx: WidgetContext,
        $element: HTMLElement,
        isEdit?: boolean
    ) {
        if (this.map) {
            this.map.map.remove();
            delete this.map;
        }

        this.data = ctx.data;
        if (!$element) {
            $element = ctx.$container[0];
        }
        this.settings = this.initSettings(ctx.settings, isEdit);
        this.settings.tooltipAction = this.getDescriptors('tooltipAction');
        this.settings.markerClick = this.getDescriptors('markerClick');
        this.settings.polygonClick = this.getDescriptors('polygonClick');
        this.settings.circleClick = this.getDescriptors('circleClick');

        const MapClass = providerClass[this.provider];
        if (!MapClass) {
            return;
        }
        parseWithTranslation.setTranslate(this.translate);
        this.map = new MapClass(this.ctx, $element, this.settings);
        (this.ctx as any).mapInstance = this.map;
        this.map.saveMarkerLocation = this.setMarkerLocation.bind(this);
        this.map.savePolygonLocation = this.savePolygonLocation.bind(this);
        this.map.saveLocation = this.saveLocation.bind(this);
        this.pageLink = {
          page: 0,
          pageSize: this.settings.mapPageSize,
          textSearch: null,
          dynamic: true
        };
        this.map.setLoading(true);
        this.ctx.defaultSubscription.subscribeAllForPaginatedData(this.pageLink, null);
    }

    map: LeafletMap;
    provider: MapProviders;
    schema: JsonSettingsSchema;
    data: DatasourceData[];
    settings: UnitedMapSettings;
    pageLink: EntityDataPageLink;

    public static dataKeySettingsSchema(): object {
        return {};
    }

    public static getProvidersSchema(mapProvider: MapProviders, ignoreImageMap = false) {
       return getProviderSchema(mapProvider, ignoreImageMap);
    }

    public static settingsSchema(mapProvider: MapProviders, drawRoutes: boolean): JsonSettingsSchema {
        const schema = initSchema();
        addToSchema(schema, this.getProvidersSchema(mapProvider));
        addGroupInfo(schema, 'Map Provider Settings');
        addToSchema(schema, commonMapSettingsSchema);
        addGroupInfo(schema, 'Common Map Settings');
        addToSchema(schema, addCondition(mapPolygonSchema, 'model.showPolygon === true', ['showPolygon']));
        addGroupInfo(schema, 'Polygon Settings');
        addToSchema(schema, addCondition(mapCircleSchema, 'model.showCircle === true', ['showCircle']));
        addGroupInfo(schema, 'Circle Settings');
        if (drawRoutes) {
            addToSchema(schema, routeMapSettingsSchema);
            addGroupInfo(schema, 'Route Map Settings');
        } else {
            const clusteringSchema = mergeSchemes([markerClusteringSettingsSchema,
                addCondition(markerClusteringSettingsSchemaLeaflet,
                    `model.useClusterMarkers === true && model.provider !== "image-map"`)]);
            addToSchema(schema, clusteringSchema);
            addGroupInfo(schema, 'Markers Clustering Settings');
            addToSchema(schema, addCondition(editorSettingSchema, '(model.editablePolygon === true || model.draggableMarker === true)'));
            addGroupInfo(schema, 'Editor settings');
        }
        return schema;
    }

    public static actionSources(): object {
        return {
            markerClick: {
                name: 'widget-action.marker-click',
                multiple: false
            },
            polygonClick: {
                name: 'widget-action.polygon-click',
                multiple: false
            },
            circleClick: {
                name: 'widget-action.circle-click',
                multiple: false
            },
            tooltipAction: {
                name: 'widget-action.tooltip-tag-action',
                multiple: true
            }
        };
    }

    translate = (key: string, defaultTranslation?: string): string => {
      if (key) {
        return (this.ctx.$injector.get(UtilsService).customTranslation(key, defaultTranslation || key)
          || this.ctx.$injector.get(TranslateService).instant(key));
      }
      return '';
    }

    getDescriptors(name: string): { [name: string]: ($event: Event, datasource: Datasource) => void } {
        const descriptors = this.ctx.actionsApi.getActionDescriptors(name);
        const actions = {};
        descriptors.forEach(descriptor => {
            actions[descriptor.name] = ($event: Event, datasource: Datasource) => this.onCustomAction(descriptor, $event, datasource);
        }, actions);
        return actions;
    }

    onInit() {
    }

    private onCustomAction(descriptor: WidgetActionDescriptor, $event: Event, entityInfo: Datasource) {
        if ($event) {
            $event.preventDefault();
            $event.stopPropagation();
        }
        const { entityId, entityName, entityLabel, entityType } = entityInfo;
        this.ctx.actionsApi.handleWidgetAction($event, descriptor, {
            entityType,
            id: entityId
        }, entityName, null, entityLabel);
    }

    setMarkerLocation(e: FormattedData, lat?: number, lng?: number) {
      let markerValue;
      if (isDefined(lat) && isDefined(lng)) {
        const point = lat != null && lng !== null ? L.latLng(lat, lng) : null;
        markerValue = this.map.convertToCustomFormat(point);
      } else if (this.settings.mapProvider !== MapProviders.image) {
        markerValue = {
          [this.settings.latKeyName]: e[this.settings.latKeyName],
          [this.settings.lngKeyName]: e[this.settings.lngKeyName],
        };
      } else {
        markerValue = {
          [this.settings.xPosKeyName]: e[this.settings.xPosKeyName],
          [this.settings.yPosKeyName]: e[this.settings.yPosKeyName],
        };
      }
      return this.saveLocation(e, markerValue);
    }

    savePolygonLocation(e: FormattedData, coordinates?: Array<any>) {
      let polygonValue;
      if (isDefined(coordinates)) {
        polygonValue = this.map.convertToPolygonFormat(coordinates);
      } else {
        polygonValue = {
          [this.settings.polygonKeyName]: e[this.settings.polygonKeyName]
        };
      }
      return this.saveLocation(e, polygonValue);
    }

    saveLocation(e: FormattedData, values: {[key: string]: any}): Observable<any> {
      const attributeService = this.ctx.$injector.get(AttributeService);
      const attributes = [];
      const timeseries = [];

      const entityId: EntityId = {
        entityType: e.$datasource.entityType,
        id: e.$datasource.entityId
      };

      for (const dataKeyName of Object.keys(values)) {
        for (const key of e.$datasource.dataKeys) {
          if (dataKeyName === key.name) {
            const value = {
              key: key.name,
              value: values[dataKeyName]
            };
            if (key.type === DataKeyType.attribute) {
              attributes.push(value);
            } else if (key.type === DataKeyType.timeseries) {
              timeseries.push(value);
            }
            break;
          }
        }
      }

      const observables: Observable<any>[] = [];
      if (timeseries.length) {
        observables.push(attributeService.saveEntityTimeseries(
          entityId,
          LatestTelemetry.LATEST_TELEMETRY,
          timeseries
        ));
      }
      if (attributes.length) {
        observables.push(attributeService.saveEntityAttributes(
          entityId,
          AttributeScope.SERVER_SCOPE,
          attributes
        ));
      }
      if (observables.length) {
        return forkJoin(observables);
      } else {
        return of(null);
      }
    }

    initSettings(settings: UnitedMapSettings, isEditMap?: boolean): UnitedMapSettings {
        const functionParams = ['data', 'dsData', 'dsIndex'];
        this.provider = settings.provider || this.mapProvider;
        if (this.provider === MapProviders.here && !settings.mapProviderHere) {
          if (settings.mapProvider && hereProviders.includes(settings.mapProvider)) {
            settings.mapProviderHere = settings.mapProvider;
          } else {
            settings.mapProviderHere = hereProviders[0];
          }
        }
        const customOptions: Partial<UnitedMapSettings> = {
            provider: this.provider,
            mapUrl: settings?.mapImageUrl,
            labelFunction: parseFunction(settings.labelFunction, functionParams),
            tooltipFunction: parseFunction(settings.tooltipFunction, functionParams),
            colorFunction: parseFunction(settings.colorFunction, functionParams),
            colorPointFunction: parseFunction(settings.colorPointFunction, functionParams),
            polygonLabelFunction: parseFunction(settings.polygonLabelFunction, functionParams),
            polygonColorFunction: parseFunction(settings.polygonColorFunction, functionParams),
            polygonStrokeColorFunction: parseFunction(settings.polygonStrokeColorFunction, functionParams),
            polygonTooltipFunction: parseFunction(settings.polygonTooltipFunction, functionParams),
            circleLabelFunction: parseFunction(settings.circleLabelFunction, functionParams),
            circleStrokeColorFunction: parseFunction(settings.circleStrokeColorFunction, functionParams),
            circleFillColorFunction: parseFunction(settings.circleFillColorFunction, functionParams),
            circleTooltipFunction: parseFunction(settings.circleTooltipFunction, functionParams),
            markerImageFunction: parseFunction(settings.markerImageFunction, ['data', 'images', 'dsData', 'dsIndex']),
            labelColor: this.ctx.widgetConfig.color,
            polygonLabelColor: this.ctx.widgetConfig.color,
            polygonKeyName: settings.polKeyName ? settings.polKeyName : settings.polygonKeyName,
            tooltipPattern: settings.tooltipPattern ||
                '<b>${entityName}</b><br/><br/><b>Latitude:</b> ${' +
                settings.latKeyName + ':7}<br/><b>Longitude:</b> ${' + settings.lngKeyName + ':7}',
            defaultCenterPosition: getDefCenterPosition(settings?.defaultCenterPosition),
            currentImage: (settings.markerImage?.length) ? {
                url: settings.markerImage,
                size: settings.markerImageSize || 34
            } : null
        };
        if (isEditMap && !settings.hasOwnProperty('draggableMarker')) {
            settings.draggableMarker = true;
        }
        if (isEditMap && !settings.hasOwnProperty('editablePolygon')) {
            settings.editablePolygon = true;
        }
        return { ...defaultSettings, ...settings, ...customOptions, };
    }

    update() {
        this.map.updateData(this.drawRoutes, this.settings.showPolygon);
        this.map.setLoading(false);
    }

    resize() {
      this.map.onResize();
      this.map?.invalidateSize();
    }

    destroy() {
      if (this.map) {
        this.map.remove();
      }
      (this.ctx as any).mapInstance = null;
    }
}

export let TbMapWidgetV2: MapWidgetStaticInterface = MapWidgetController;


