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

import L, { FeatureGroup, LatLngBounds, LatLngTuple, Projection } from 'leaflet';
import tinycolor from 'tinycolor2';
import 'leaflet-providers';
import { MarkerClusterGroup, MarkerClusterGroupOptions } from 'leaflet.markercluster/dist/leaflet.markercluster';
import '@geoman-io/leaflet-geoman-free';

import {
  CircleData,
  defaultSettings,
  FormattedData,
  MapSettings,
  MarkerIconInfo,
  MarkerImageInfo,
  MarkerSettings,
  PolygonSettings,
  PolylineSettings,
  ReplaceInfo,
  UnitedMapSettings
} from './map-models';
import { Marker } from './markers';
import { Observable, of } from 'rxjs';
import { Polyline } from './polyline';
import { Polygon } from './polygon';
import { Circle } from './circle';
import { createTooltip, isCutPolygon, isJSON } from '@home/components/widget/lib/maps/maps-utils';
import {
  checkLngLat,
  createLoadingDiv,
  parseArray,
  parseData,
  safeExecute
} from '@home/components/widget/lib/maps/common-maps-utils';
import { WidgetContext } from '@home/models/widget-component.models';
import { deepClone, isDefinedAndNotNull, isNotEmptyStr, isString } from '@core/utils';
import { TranslateService } from '@ngx-translate/core';
import {
  SelectEntityDialogComponent,
  SelectEntityDialogData
} from '@home/components/widget/lib/maps/dialogs/select-entity-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import ITooltipsterInstance = JQueryTooltipster.ITooltipsterInstance;

export default abstract class LeafletMap {

    markers: Map<string, Marker> = new Map();
    polylines: Map<string, Polyline> = new Map();
    polygons: Map<string, Polygon> = new Map();
    circles: Map<string, Circle> = new Map();
    map: L.Map;
    options: UnitedMapSettings;
    bounds: L.LatLngBounds;
    datasources: FormattedData[];
    markersCluster: MarkerClusterGroup;
    points: FeatureGroup;
    markersData: FormattedData[] = [];
    polygonsData: FormattedData[] = [];
    circleData: FormattedData[] = [];
    defaultMarkerIconInfo: MarkerIconInfo;
    loadingDiv: JQuery<HTMLElement>;
    loading = false;
    replaceInfoLabelMarker: Array<ReplaceInfo> = [];
    markerLabelText: string;
    polygonLabelText: string;
    circleLabelText: string;
    replaceInfoLabelPolygon: Array<ReplaceInfo> = [];
    replaceInfoTooltipMarker: Array<ReplaceInfo> = [];
    replaceInfoTooltipCircle: Array<ReplaceInfo> = [];
    markerTooltipText: string;
    drawRoutes: boolean;
    showPolygon: boolean;
    updatePending = false;
    editPolygons = false;
    editCircle = false;
    selectedEntity: FormattedData;
    ignoreUpdateBounds = false;
  // tslint:disable-next-line:no-string-literal
    southWest = new L.LatLng(-Projection.SphericalMercator['MAX_LATITUDE'], -180);
  // tslint:disable-next-line:no-string-literal
    northEast = new L.LatLng(Projection.SphericalMercator['MAX_LATITUDE'], 180);
    saveLocation: (e: FormattedData, values: {[key: string]: any}) => Observable<any>;
    saveMarkerLocation: (e: FormattedData, lat?: number, lng?: number) => Observable<any>;
    savePolygonLocation: (e: FormattedData, coordinates?: Array<any>) => Observable<any>;
    translateService: TranslateService;
    tooltipInstances: ITooltipsterInstance[] = [];

    protected constructor(public ctx: WidgetContext,
                          public $container: HTMLElement,
                          options: UnitedMapSettings) {
        this.options = options;
        this.editPolygons = options.showPolygon && options.editablePolygon;
        this.editCircle = options.showCircle && options.editableCircle;
        L.Icon.Default.imagePath = '/';
        this.translateService = this.ctx.$injector.get(TranslateService);
    }

    public initSettings(options: MapSettings) {
        this.options.tinyColor = tinycolor(this.options.color || defaultSettings.color);
        const { useClusterMarkers,
            zoomOnClick,
            showCoverageOnHover,
            removeOutsideVisibleBounds,
            animate,
            chunkedLoading,
            spiderfyOnMaxZoom,
            maxClusterRadius,
            maxZoom }: MapSettings = options;
        if (useClusterMarkers) {
            // disabled marker cluster icon
            (L as any).MarkerCluster = (L as any).MarkerCluster.extend({
              options: { pmIgnore: true, ...L.Icon.prototype.options }
            });
            const clusteringSettings: MarkerClusterGroupOptions = {
                spiderfyOnMaxZoom,
                zoomToBoundsOnClick: zoomOnClick,
                showCoverageOnHover,
                removeOutsideVisibleBounds,
                animate,
                chunkedLoading,
                pmIgnore: true,
                spiderLegPolylineOptions: {
                  pmIgnore: true
                },
                polygonOptions: {
                  pmIgnore: true
                }
            };
            if (maxClusterRadius && maxClusterRadius > 0) {
                clusteringSettings.maxClusterRadius = Math.floor(maxClusterRadius);
            }
            if (maxZoom && maxZoom >= 0 && maxZoom < 19) {
                clusteringSettings.disableClusteringAtZoom = Math.floor(maxZoom);
            }
            this.markersCluster = new MarkerClusterGroup(clusteringSettings);
        }
    }

    private selectEntityWithoutLocationDialog(shapes: L.PM.SUPPORTED_SHAPES): Observable<FormattedData> {
      let entities;
      switch (shapes) {
        case 'Polygon':
        case 'Rectangle':
          entities = this.datasources.filter(pData => !this.isValidPolygonPosition(pData));
          break;
        case 'Marker':
          entities = this.datasources.filter(mData => !this.convertPosition(mData));
          break;
        case 'Circle':
          entities = this.datasources.filter(mData => !this.isValidCircle(mData));
          break;
        default:
          return of(null);
      }
      if (entities.length === 1) {
        return of(entities[0]);
      }
      const dialog = this.ctx.$injector.get(MatDialog);
      return dialog.open<SelectEntityDialogComponent, SelectEntityDialogData, FormattedData>(SelectEntityDialogComponent,
        {
          disableClose: true,
          panelClass: ['tb-dialog', 'tb-fullscreen-dialog'],
          data: {
            entities
          }
        }).afterClosed();
    }

    private selectEntityWithoutLocation(type: string) {
      this.selectEntityWithoutLocationDialog(type.substring(2)).subscribe((data) => {
        if (data !== null) {
          this.selectedEntity = data;
          this.toggleDrawMode(type);
          let tooltipText;
          let customTranslation;
          switch (type) {
            case 'tbMarker':
              tooltipText = this.translateService.instant('widgets.maps.tooltips.placeMarker', {entityName: data.entityName});
              // @ts-ignore
              this.map.pm.Draw.tbMarker._hintMarker.setTooltipContent(tooltipText);
              break;
            case 'tbCircle':
              tooltipText = this.translateService.instant('widgets.maps.tooltips.startCircle', {entityName: data.entityName});
              // @ts-ignore
              this.map.pm.Draw.tbCircle._hintMarker.setTooltipContent(tooltipText);
              customTranslation = {
                tooltips: {
                  finishCircle: this.translateService.instant('widgets.maps.tooltips.finishCircle', {entityName: data.entityName})
                }
              };
              break;
            case 'tbRectangle':
              tooltipText = this.translateService.instant('widgets.maps.tooltips.firstVertex', {entityName: data.entityName});
              // @ts-ignore
              this.map.pm.Draw.tbRectangle._hintMarker.setTooltipContent(tooltipText);
              customTranslation = {
                tooltips: {
                  finishRect: this.translateService.instant('widgets.maps.tooltips.finishRect', {entityName: data.entityName})
                }
              };
              break;
            case 'tbPolygon':
              tooltipText = this.translateService.instant('widgets.maps.tooltips.firstVertex', {entityName: data.entityName});
              // @ts-ignore
              this.map.pm.Draw.tbPolygon._hintMarker.setTooltipContent(tooltipText);
              customTranslation = {
                tooltips: {
                  continueLine: this.translateService.instant('widgets.maps.tooltips.continueLine', {entityName: data.entityName}),
                  finishPoly: this.translateService.instant('widgets.maps.tooltips.finishPoly', {entityName: data.entityName})
                }
              };
              break;
          }
          if (customTranslation) {
            this.map.pm.setLang('en', customTranslation, 'en');
            this.createdControlButtonTooltip();
          }
        } else {
          // @ts-ignore
          this.map.pm.Toolbar.toggleButton(type, false);
        }
      });
    }

    private toggleDrawMode(type: string) {
      this.map.pm.Draw[type].toggle();
    }

    addEditControl() {
      // Customize edit marker
      if (this.options.draggableMarker && !this.options.hideDrawControlButton) {
        const actions = [{
          text: L.PM.Utils.getTranslation('actions.cancel'),
          onClick: () => this.toggleDrawMode('tbMarker')
        }];

        this.map.pm.Toolbar.copyDrawControl('Marker', {
          name: 'tbMarker',
          afterClick: () => this.selectEntityWithoutLocation('tbMarker'),
          disabled: true,
          actions
        });
      }

      // Customize edit polygon
      if (this.editPolygons && !this.options.hideDrawControlButton) {
        const rectangleActions = [
          {
            text: L.PM.Utils.getTranslation('actions.cancel'),
            onClick: () => this.toggleDrawMode('tbRectangle')
          }
        ];

        const polygonActions = [
          'finish' as const,
          'removeLastVertex' as const,
          {
            text: L.PM.Utils.getTranslation('actions.cancel'),
            onClick: () => this.toggleDrawMode('tbPolygon')
          }
        ];

        this.map.pm.Toolbar.copyDrawControl('Rectangle', {
          name: 'tbRectangle',
          afterClick: () => this.selectEntityWithoutLocation('tbRectangle'),
          disabled: true,
          actions: rectangleActions
        });

        this.map.pm.Toolbar.copyDrawControl('Polygon', {
          name: 'tbPolygon',
          afterClick: () => this.selectEntityWithoutLocation('tbPolygon'),
          disabled: true,
          actions: polygonActions
        });
      }

      // Customize edit circle
      if (this.editCircle && !this.options.hideDrawControlButton) {
        const actions = [{
          text: L.PM.Utils.getTranslation('actions.cancel'),
          onClick: () => this.toggleDrawMode('tbCircle')
        }];

        this.map.pm.Toolbar.copyDrawControl('Circle', {
          name: 'tbCircle',
          afterClick: () => this.selectEntityWithoutLocation('tbCircle'),
          disabled: true,
          actions
        });
      }

      if (this.editPolygons && !this.options.hideEditControlButton) {
        this.map.pm.Toolbar.copyDrawControl('cutPolygon', {
          name: 'tbCut',
          title: this.translateService.instant('widgets.maps.buttonTitles.cutButton'),
          block: 'edit',
          onClick: () => {
            this.map.pm.setLang('en', {
              tooltips: {
                firstVertex: this.translateService.instant('widgets.maps.tooltips.firstVertex-cut'),
                continueLine: this.translateService.instant('widgets.maps.tooltips.continueLine-cut'),
                finishPoly: this.translateService.instant('widgets.maps.tooltips.finishPoly-cut')
              }
            }, 'en');
            this.createdControlButtonTooltip();
          },
          // @ts-ignore
          afterClick: (e, ctx) => {
            this.map.pm.Draw[ctx.button._button.jsClass].toggle({
              snappable: this.options.snappable,
              cursorMarker: true,
              allowSelfIntersection: false,
            });
          },
        });
        this.map.pm.Toolbar.changeControlOrder(['tbMarker', 'tbRectangle', 'tbPolygon', 'tbCircle', 'editMode', 'dragMode', 'tbCut', 'removalMode', 'rotateMode']);
      }

      this.map.pm.setLang('en', this.translateService.instant('widgets.maps'), 'en');
      if (!this.options.hideAllControlButton) {
        this.map.pm.addControls({
          position: 'topleft',
          drawControls: !this.options.hideDrawControlButton,
          drawMarker: false,
          drawCircle: false,
          drawCircleMarker: false,
          drawRectangle: false,
          drawPolyline: false,
          drawPolygon: false,
          dragMode: !this.options.hideEditControlButton,
          editMode: (this.editPolygons || this.editCircle) && !this.options.hideEditControlButton,
          cutPolygon: false,
          removalMode: !this.options.hideRemoveControlButton,
          rotateMode: this.editPolygons && !this.options.hideEditControlButton
        });
      }

      if (this.options.initDragMode) {
        this.map.pm.enableGlobalDragMode();
        this.ignoreUpdateBounds = true;
      }

      this.map.on('pm:globaldrawmodetoggled', (e) => this.ignoreUpdateBounds = e.enabled);
      this.map.on('pm:globaleditmodetoggled', (e) => this.ignoreUpdateBounds = e.enabled);
      this.map.on('pm:globaldragmodetoggled', (e) => this.ignoreUpdateBounds = e.enabled);
      this.map.on('pm:globalremovalmodetoggled', (e) => this.ignoreUpdateBounds = e.enabled);
      this.map.on('pm:globalcutmodetoggled', (e) => this.ignoreUpdateBounds = e.enabled);
      this.map.on('pm:globalrotatemodetoggled', (e) => this.ignoreUpdateBounds = e.enabled);

      this.map.on('pm:create', (e) => {
        switch (e.shape) {
          case 'tbMarker':
            // @ts-ignore
            this.saveLocation(this.selectedEntity, this.convertToCustomFormat(e.layer.getLatLng())).subscribe(() => {});
            break;
          case 'tbRectangle':
          case 'tbPolygon':
            let coordinates;
            if (e.shape === 'tbRectangle') {
              // @ts-ignore
              const bounds: L.LatLngBounds = e.layer.getBounds();
              coordinates = [bounds.getNorthWest(), bounds.getSouthEast()];
            } else {
              // @ts-ignore
              coordinates = e.layer.getLatLngs()[0];
            }
            this.saveLocation(this.selectedEntity, this.convertPolygonToCustomFormat(coordinates)).subscribe(() => {});
            break;
          case 'tbCircle':
            // @ts-ignore
            this.saveLocation(this.selectedEntity, this.convertCircleToCustomFormat(e.layer.getLatLng(), e.layer.getRadius()))
              .subscribe(() => {});
        }
        // @ts-ignore
        e.layer._pmTempLayer = true;
        e.layer.remove();
      });

      this.map.on('pm:cut', (e) => {
        // @ts-ignore
        e.originalLayer.setLatLngs(e.layer.getLatLngs());
        e.originalLayer.addTo(this.map);
        // @ts-ignore
        e.originalLayer._pmTempLayer = false;
        const iterator = this.polygons.values();
        let result = iterator.next();
        while (!result.done && e.originalLayer !== result.value.leafletPoly) {
          result = iterator.next();
        }
        // @ts-ignore
        e.layer._pmTempLayer = true;
        e.layer.remove();
      });

      this.map.on('pm:remove', (e) => {
        if (e.shape === 'Marker') {
          const iterator = this.markers.values();
          let result = iterator.next();
          while (!result.done && e.layer !== result.value.leafletMarker) {
            result = iterator.next();
          }
          this.saveLocation(result.value.data, this.convertToCustomFormat(null)).subscribe(() => {});
        } else if (e.shape === 'Polygon' || e.shape === 'Rectangle') {
          const iterator = this.polygons.values();
          let result = iterator.next();
          while (!result.done && e.layer !== result.value.leafletPoly) {
            result = iterator.next();
          }
          this.saveLocation(result.value.data, this.convertPolygonToCustomFormat(null)).subscribe(() => {});
        } else if (e.shape === 'Circle') {
          const iterator = this.circles.values();
          let result = iterator.next();
          while (!result.done && e.layer !== result.value.leafletCircle) {
            result = iterator.next();
          }
          this.saveLocation(result.value.data, this.convertCircleToCustomFormat(null, 0)).subscribe(() => {});
        }
      });
    }

    public setLoading(loading: boolean) {
      if (this.loading !== loading) {
        this.loading = loading;
        if (this.loading) {
          if (!this.loadingDiv) {
            this.loadingDiv = createLoadingDiv(this.ctx.translate.instant('common.loading'));
          }
          this.$container.appendChild(this.loadingDiv[0]);
        } else {
          if (this.loadingDiv) {
            this.loadingDiv.remove();
          }
        }
      }
    }

    public setMap(map: L.Map) {
        this.map = map;
        this.map.on('move', () => {
          this.ctx.updatePopoverPositions();
        });
        this.map.on('zoomstart', () => {
          this.ctx.setPopoversHidden(true);
        });
        this.map.on('zoomend', () => {
          this.ctx.setPopoversHidden(false);
          this.ctx.updatePopoverPositions();
          setTimeout(() => {
            this.ctx.updatePopoverPositions();
          });
        });
        if (this.options.useDefaultCenterPosition) {
          this.map.panTo(this.options.defaultCenterPosition);
          this.bounds = map.getBounds();
        } else {
          this.bounds = new L.LatLngBounds(null, null);
        }
        if (this.options.disableScrollZooming) {
          this.map.scrollWheelZoom.disable();
        }
        if (this.options.draggableMarker || this.editPolygons || this.editCircle) {
          map.pm.setGlobalOptions({ snappable: false } as L.PM.GlobalOptions);
          map.pm.applyGlobalOptions();
          this.addEditControl();
        } else {
          this.map.pm.disableDraw();
        }
        if (this.options.useClusterMarkers) {
          this.map.addLayer(this.markersCluster);
        }
        if (this.updatePending) {
          this.updatePending = false;
          this.updateData(this.drawRoutes, this.showPolygon);
        }
        this.createdControlButtonTooltip();
    }

    private createdControlButtonTooltip() {
      import('tooltipster').then(() => {
        if ($.tooltipster) {
          this.tooltipInstances.forEach((instance) => {
            instance.destroy();
          });
          this.tooltipInstances = [];
        }
        $(this.ctx.$container)
          .find('a[role="button"]:not(.leaflet-pm-action)')
          .each((index, element) => {
            let title;
            if (element.children.length) {
              title = (element.children[0] as HTMLElement).title;
              $(element).children().removeAttr('title');
            } else {
              title = element.title;
              $(element).removeAttr('title');
            }
            const tooltip =  $(element).tooltipster(
              {
                content: title,
                theme: 'tooltipster-shadow',
                delay: 10,
                triggerClose: {
                  click: true,
                  tap: true,
                  scroll: true,
                  mouseleave: true
                },
                side: 'right',
                distance: 2,
                trackOrigin: true
              }
            );
            this.tooltipInstances.push(tooltip.tooltipster('instance'));
          });
      });
    }

    createLatLng(lat: number, lng: number): L.LatLng {
        return L.latLng(lat, lng);
    }

    createBounds(): L.LatLngBounds {
        return this.map.getBounds();
    }

    extendBounds(bounds: L.LatLngBounds, polyline: L.Polyline) {
        if (polyline && polyline.getLatLngs() && polyline.getBounds()) {
            bounds.extend(polyline.getBounds());
        }
    }

    invalidateSize() {
        this.map?.invalidateSize(true);
    }

    onResize() {

    }

    getCenter() {
        return this.map.getCenter();
    }

    fitBounds(bounds: LatLngBounds, padding?: LatLngTuple) {
        if (bounds.isValid()) {
            this.bounds = !!this.bounds ? this.bounds.extend(bounds) : bounds;
            if (!this.options.fitMapBounds && this.options.defaultZoomLevel) {
                this.map.setZoom(this.options.defaultZoomLevel, { animate: false });
                if (this.options.useDefaultCenterPosition) {
                    this.map.panTo(this.options.defaultCenterPosition, { animate: false });
                }
                else {
                    this.map.panTo(this.bounds.getCenter());
                }
            } else {
                this.map.once('zoomend', () => {
                    let minZoom = this.options.minZoomLevel;
                    if (this.options.defaultZoomLevel) {
                      minZoom = Math.max(minZoom, this.options.defaultZoomLevel);
                    }
                    if (this.map.getZoom() > minZoom) {
                        this.map.setZoom(minZoom, { animate: false });
                    }
                });
                if (this.options.useDefaultCenterPosition) {
                    this.bounds = this.bounds.extend(this.options.defaultCenterPosition);
                }
                this.map.fitBounds(this.bounds, { padding: padding || [50, 50], animate: false });
                this.map.invalidateSize();
            }
        }
    }

    convertPosition(expression: object): L.LatLng {
      if (!expression) {
        return null;
      }
      const lat = expression[this.options.latKeyName];
      const lng = expression[this.options.lngKeyName];
      if (!isDefinedAndNotNull(lat) || isString(lat) || isNaN(lat) || !isDefinedAndNotNull(lng) || isString(lng) || isNaN(lng)) {
        return null;
      }
      return L.latLng(lat, lng) as L.LatLng;
    }

    convertPositionPolygon(expression: (LatLngTuple | LatLngTuple[] | LatLngTuple[][])[]) {
          return (expression).map((el) => {
            if (!Array.isArray(el[0]) && el.length === 2) {
              return el;
            } else if (Array.isArray(el) && el.length) {
              return this.convertPositionPolygon(el as LatLngTuple[] | LatLngTuple[][]);
            } else {
              return null;
            }
        }).filter(el => !!el);
    }

    convertToCustomFormat(position: L.LatLng, offset = 0): object {
      position = position ? checkLngLat(position, this.southWest, this.northEast, offset) : {lat: null, lng: null} as L.LatLng;

      return {
        [this.options.latKeyName]: position.lat,
        [this.options.lngKeyName]: position.lng
      };
    }

    convertToPolygonFormat(points: Array<any>): Array<any> {
      if (points.length) {
        return points.map(point => {
          if (point.length) {
            return this.convertToPolygonFormat(point);
          } else {
            const convertPoint = checkLngLat(point, this.southWest, this.northEast);
            return [convertPoint.lat, convertPoint.lng];
          }
        });
      }
      return [];
    }

    convertPolygonToCustomFormat(expression: any[][]): {[key: string]: any} {
      const coordinate = expression ? this.convertToPolygonFormat(expression) : null;
      return {
        [this.options.polygonKeyName]: coordinate
      };
    }

    updateData(drawRoutes: boolean, showPolygon: boolean) {
      this.drawRoutes = drawRoutes;
      this.showPolygon = showPolygon;
      if (this.map) {
        const data = this.ctx.data;
        const formattedData = parseData(data);
        if (drawRoutes) {
          const polyData = parseArray(data);
          this.updatePolylines(polyData, formattedData, false);
        }
        if (showPolygon) {
          this.updatePolygons(formattedData, false);
        }
        if (this.options.showCircle) {
          this.updateCircle(formattedData, false);
        }
        this.updateMarkers(formattedData, false);
        this.updateBoundsInternal();
        if (this.options.draggableMarker || this.editPolygons || this.editCircle) {
          let foundEntityWithLocation = false;
          let foundEntityWithPolygon = false;
          let foundEntityWithCircle = false;

          if (this.options.draggableMarker && !this.options.hideDrawControlButton && !this.options.hideAllControlButton) {
            let foundEntityWithoutLocation = false;
            for (const mData of formattedData) {
              const position = this.convertPosition(mData);
              if (!position) {
                foundEntityWithoutLocation = true;
              } else if (!!position) {
                foundEntityWithLocation = true;
              }
              if (foundEntityWithoutLocation && foundEntityWithLocation) {
                break;
              }
            }
            // @ts-ignore
            if (this.map.pm.Toolbar.getButtons().tbMarker.disable !== foundEntityWithoutLocation) {
              this.map.pm.Toolbar.setButtonDisabled('tbMarker', !foundEntityWithoutLocation);
            }
            this.datasources = formattedData;
          }

          if (this.editPolygons && !this.options.hideDrawControlButton && !this.options.hideAllControlButton) {
            let foundEntityWithoutPolygon = false;
            for (const pData of formattedData) {
              const isValidPolygon = this.isValidPolygonPosition(pData);
              if (!isValidPolygon) {
                foundEntityWithoutPolygon = true;
              } else if (isValidPolygon) {
                foundEntityWithPolygon = true;
              }
              if (foundEntityWithoutPolygon && foundEntityWithPolygon) {
                break;
              }
            }
            // @ts-ignore
            if (this.map.pm.Toolbar.getButtons().tbPolygon.disable !== foundEntityWithoutPolygon) {
              this.map.pm.Toolbar.setButtonDisabled('tbPolygon', !foundEntityWithoutPolygon);
              this.map.pm.Toolbar.setButtonDisabled('tbRectangle', !foundEntityWithoutPolygon);
            }
            this.datasources = formattedData;
          }

          if (this.editCircle && !this.options.hideDrawControlButton && !this.options.hideAllControlButton) {
            let foundEntityWithoutCircle = false;
            for (const cData of formattedData) {
              const isValidCircle = this.isValidCircle(cData);
              if (!isValidCircle) {
                foundEntityWithoutCircle = true;
              } else if (isValidCircle) {
                foundEntityWithCircle = true;
              }
              if (foundEntityWithoutCircle && foundEntityWithCircle) {
                break;
              }
            }
            // @ts-ignore
            if (this.map.pm.Toolbar.getButtons().tbCircle.disable !== foundEntityWithoutCircle) {
              this.map.pm.Toolbar.setButtonDisabled('tbCircle', !foundEntityWithoutCircle);
            }
            this.datasources = formattedData;
          }

          if (!this.options.hideRemoveControlButton && !this.options.hideAllControlButton) {
            const disabledButton = !foundEntityWithLocation && !foundEntityWithPolygon && !foundEntityWithCircle;
            if (disabledButton && this.map.pm.globalRemovalModeEnabled()) {
              this.map.pm.toggleGlobalRemovalMode();
            }
            this.map.pm.Toolbar.setButtonDisabled('removalMode', disabledButton);
          }
          if (!this.options.hideEditControlButton && !this.options.hideAllControlButton) {
            const disabledButton = !foundEntityWithLocation && !foundEntityWithPolygon && !foundEntityWithCircle;
            // @ts-ignore
            if (this.map.pm.Toolbar.getButtons().dragMode.disable !== disabledButton) {
              this.map.pm.Toolbar.setButtonDisabled('dragMode', disabledButton);
              const foundEntityWithPoly = foundEntityWithPolygon || foundEntityWithCircle;
              // @ts-ignore
              if ((this.editPolygons || this.editCircle) && this.map.pm.Toolbar.getButtons().editMode.disable !== foundEntityWithPoly) {
                this.map.pm.Toolbar.setButtonDisabled('editMode', !foundEntityWithPoly);
              }
              // @ts-ignore
              if (this.editPolygons && this.map.pm.Toolbar.getButtons().tbCut.disable !== foundEntityWithPolygon) {
                this.map.pm.Toolbar.setButtonDisabled('tbCut', !foundEntityWithPolygon);
                this.map.pm.Toolbar.setButtonDisabled('rotateMode', !foundEntityWithPolygon);
              }
            }
          }
        }
      } else {
        this.updatePending = true;
      }
    }

  private updateBoundsInternal() {
    const bounds = new L.LatLngBounds(null, null);
    if (this.drawRoutes) {
      this.polylines.forEach((polyline) => {
        bounds.extend(polyline.leafletPoly.getBounds());
      });
    }
    if (this.showPolygon) {
      this.polygons.forEach((polygon) => {
        bounds.extend(polygon.leafletPoly.getBounds());
      });
    }
    if (this.options.showCircle) {
      this.circles.forEach((polygon) => {
        bounds.extend(polygon.leafletCircle.getBounds());
      });
    }
    if ((this.options as MarkerSettings).useClusterMarkers && this.markersCluster.getBounds().isValid()) {
      bounds.extend(this.markersCluster.getBounds());
    } else {
      this.markers.forEach((marker) => {
        bounds.extend(marker.leafletMarker.getLatLng());
      });
    }

    const mapBounds = this.map.getBounds();
    if (bounds.isValid() && (!this.bounds || !this.bounds.isValid() || !this.bounds.equals(bounds)
        && this.options.fitMapBounds ? !mapBounds.contains(bounds) : false)) {
      this.bounds = bounds;
      if (!this.ignoreUpdateBounds) {
        this.fitBounds(bounds);
      }
    }
  }

  // Markers
    updateMarkers(markersData: FormattedData[], updateBounds = true, callback?) {
      const rawMarkers = markersData.filter(mdata => !!this.convertPosition(mdata));
      const toDelete = new Set(Array.from(this.markers.keys()));
      const createdMarkers: Marker[] = [];
      const updatedMarkers: Marker[] = [];
      const deletedMarkers: Marker[] = [];
      let m: Marker;
      rawMarkers.forEach(data => {
        if (data.rotationAngle || data.rotationAngle === 0) {
          const currentImage: MarkerImageInfo = this.options.useMarkerImageFunction ?
            safeExecute(this.options.markerImageFunction,
              [data, this.options.markerImages, markersData, data.dsIndex]) : this.options.currentImage;
          const style = currentImage ? 'background-image: url(' + currentImage.url + ');' : '';
          this.options.icon = { icon: L.divIcon({
            html: `<div class="arrow"
               style="transform: translate(-10px, -10px)
               rotate(${data.rotationAngle}deg);
               ${style}"><div>`
          }),  size: [30, 30]};
        } else {
          this.options.icon = null;
        }
        if (this.markers.get(data.entityName)) {
          m = this.updateMarker(data.entityName, data, markersData, this.options);
          if (m) {
            updatedMarkers.push(m);
          }
        } else {
          m = this.createMarker(data.entityName, data, markersData, this.options, updateBounds, callback);
          if (m) {
            createdMarkers.push(m);
          }
        }
        toDelete.delete(data.entityName);
      });
      toDelete.forEach((key) => {
        m = this.deleteMarker(key);
        if (m) {
          deletedMarkers.push(m);
        }
      });
      this.markersData = markersData;
      if (this.options.useClusterMarkers) {
        if (createdMarkers.length) {
          this.markersCluster.addLayers(createdMarkers.map(marker => marker.leafletMarker));
        }
        if (updatedMarkers.length) {
          this.markersCluster.refreshClusters(updatedMarkers.map(marker => marker.leafletMarker));
        }
        if (deletedMarkers.length) {
          this.markersCluster.removeLayers(deletedMarkers.map(marker => marker.leafletMarker));
        }
      }
    }

    dragMarker = (e, data = {} as FormattedData) => {
        if (e === undefined) {
          return;
        }
        this.saveLocation(data, this.convertToCustomFormat(e.target._latlng)).subscribe();
    }

    private createMarker(key: string, data: FormattedData, dataSources: FormattedData[], settings: UnitedMapSettings,
                         updateBounds = true, callback?): Marker {
      const newMarker = new Marker(this, this.convertPosition(data), settings, data, dataSources, this.dragMarker);
      if (callback) {
        newMarker.leafletMarker.on('click', () => {
          callback(data, true);
        });
      }
      if (this.bounds && updateBounds && !this.options.useClusterMarkers) {
        this.fitBounds(this.bounds.extend(newMarker.leafletMarker.getLatLng()));
      }
      this.markers.set(key, newMarker);
      if (!this.options.useClusterMarkers) {
        this.map.addLayer(newMarker.leafletMarker);
      }
      return newMarker;
    }

    private updateMarker(key: string, data: FormattedData, dataSources: FormattedData[], settings: MarkerSettings): Marker {
        const marker: Marker = this.markers.get(key);
        const location = this.convertPosition(data);
        marker.updateMarkerPosition(location);
        marker.setDataSources(data, dataSources);
        if (settings.showTooltip) {
            marker.updateMarkerTooltip(data);
        }
        marker.updateMarkerIcon(settings);
        return marker;
    }

    deleteMarker(key: string): Marker {
      const marker = this.markers.get(key);
      const leafletMarker = marker?.leafletMarker;
      if (leafletMarker) {
          if (!this.options.useClusterMarkers) {
            this.map.removeLayer(leafletMarker);
          }
          this.markers.delete(key);
      }
      return marker;
    }

    deletePolygon(key: string) {
      const polygon = this.polygons.get(key)?.leafletPoly;
      if (polygon) {
        this.map.removeLayer(polygon);
        this.polygons.delete(key);
      }
      return polygon;
    }

  updatePoints(pointsData: FormattedData[][],
               getTooltip: (point: FormattedData, points: FormattedData[]) => string) {
    if (pointsData.length) {
      if (this.points) {
        this.map.removeLayer(this.points);
      }
      this.points = new FeatureGroup();
    }
    let pointColor = this.options.pointColor;
    for (const pointsList of pointsData) {
      for (let tsIndex = 0; tsIndex < pointsList.length; tsIndex++) {
        const pdata = pointsList[tsIndex];
        if (!!this.convertPosition(pdata)) {
          const dsData = pointsData.map(ds => ds[tsIndex]);
          if (this.options.useColorPointFunction) {
            pointColor = safeExecute(this.options.colorPointFunction, [pdata, dsData, pdata.dsIndex]);
          }
          const point = L.circleMarker(this.convertPosition(pdata), {
            color: pointColor,
            radius: this.options.pointSize
          });
          if (!this.options.pointTooltipOnRightPanel) {
            point.on('click', () => getTooltip(pdata, dsData));
          } else {
            createTooltip(point, this.options, pdata.$datasource, this.options.autocloseTooltip,
              this.options.showTooltipAction, getTooltip(pdata, dsData));
          }
          this.points.addLayer(point);
        }
      }
    }
    if (pointsData.length) {
      this.map.addLayer(this.points);
    }
  }

    // Polyline

    updatePolylines(polyData: FormattedData[][], dsData: FormattedData[], updateBounds = true) {
        const keys: string[] = [];
        polyData.forEach((tsData: FormattedData[], index) => {
            const data = dsData[index];
            if (tsData.length && data.entityName === tsData[0].entityName) {
                if (this.polylines.get(data.entityName)) {
                    this.updatePolyline(data, tsData, dsData, this.options, updateBounds);
                } else {
                    this.createPolyline(data, tsData, dsData, this.options, updateBounds);
                }
                keys.push(data.entityName);
            }
        });
        const toDelete: string[] = [];
        this.polylines.forEach((v, mKey) => {
          if (!keys.includes(mKey)) {
            toDelete.push(mKey);
          }
        });
        toDelete.forEach((key) => {
          this.removePolyline(key);
        });
    }

    createPolyline(data: FormattedData, tsData: FormattedData[], dsData: FormattedData[], settings: PolylineSettings, updateBounds = true) {
        const poly = new Polyline(this.map,
          tsData.map(el => this.convertPosition(el)).filter(el => !!el), data, dsData, settings);
        if (updateBounds) {
          const bounds = poly.leafletPoly.getBounds();
          this.fitBounds(bounds);
        }
        this.polylines.set(data.entityName, poly);
    }

    updatePolyline(data: FormattedData, tsData: FormattedData[], dsData: FormattedData[], settings: PolylineSettings, updateBounds = true) {
        const poly = this.polylines.get(data.entityName);
        const oldBounds = poly.leafletPoly.getBounds();
        poly.updatePolyline(tsData.map(el => this.convertPosition(el)).filter(el => !!el), data, dsData, settings);
        const newBounds = poly.leafletPoly.getBounds();
        if (updateBounds && oldBounds.toBBoxString() !== newBounds.toBBoxString()) {
            this.fitBounds(newBounds);
        }
    }

    removePolyline(name: string) {
        const poly = this.polylines.get(name);
        if (poly) {
            this.map.removeLayer(poly.leafletPoly);
            if (poly.polylineDecorator) {
                this.map.removeLayer(poly.polylineDecorator);
            }
            this.polylines.delete(name);
        }
    }

    // Polygon

  isValidPolygonPosition(data: FormattedData): boolean {
    return data && ((isNotEmptyStr(data[this.options.polygonKeyName]) && !isJSON(data[this.options.polygonKeyName])
      || Array.isArray(data[this.options.polygonKeyName])));
  }

  updatePolygons(polyData: FormattedData[], updateBounds = true) {
    const keys: string[] = [];
    this.polygonsData = deepClone(polyData);
    polyData.forEach((data: FormattedData) => {
      if (this.isValidPolygonPosition(data)) {
        if (isString((data[this.options.polygonKeyName]))) {
          data[this.options.polygonKeyName] = JSON.parse(data[this.options.polygonKeyName]);
        }
        data[this.options.polygonKeyName] = this.convertPositionPolygon(data[this.options.polygonKeyName]);

        if (this.polygons.get(data.entityName)) {
          this.updatePolygon(data, polyData, this.options, updateBounds);
        } else {
          this.createPolygon(data, polyData, this.options, updateBounds);
        }
        keys.push(data.entityName);
      }
    });
    const toDelete: string[] = [];
    this.polygons.forEach((v, mKey) => {
      if (!keys.includes(mKey)) {
        toDelete.push(mKey);
      }
    });
    toDelete.forEach((key) => {
      this.removePolygon(key);
    });
  }

  dragPolygonVertex = (e?, data = {} as FormattedData) => {
    if (e === undefined) {
      return;
    }
    let coordinates = e.layer.getLatLngs();
    if (coordinates.length === 1) {
      coordinates = coordinates[0];
    }
    if (e.shape === 'Rectangle' && !isCutPolygon(coordinates)) {
      // @ts-ignore
      const bounds: L.LatLngBounds = e.layer.getBounds();
      const boundsArray = [bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthWest(), bounds.getSouthEast()];
      if (coordinates.every(point => boundsArray.find(boundPoint => boundPoint.equals(point)) !== undefined)) {
        coordinates = [bounds.getNorthWest(), bounds.getSouthEast()];
      }
    }
    this.saveLocation(data, this.convertPolygonToCustomFormat(coordinates)).subscribe(() => {});
  }

    createPolygon(polyData: FormattedData, dataSources: FormattedData[], settings: UnitedMapSettings, updateBounds = true) {
      const polygon = new Polygon(this.map, polyData, dataSources, settings, this.dragPolygonVertex);
      if (updateBounds) {
        const bounds = polygon.leafletPoly.getBounds();
        this.fitBounds(bounds);
      }
      this.polygons.set(polyData.entityName, polygon);
    }

    updatePolygon(polyData: FormattedData, dataSources: FormattedData[], settings: PolygonSettings, updateBounds = true) {
      const poly = this.polygons.get(polyData.entityName);
      const oldBounds = poly.leafletPoly.getBounds();
      poly.updatePolygon(polyData, dataSources, settings);
      const newBounds = poly.leafletPoly.getBounds();
      if (updateBounds && oldBounds.toBBoxString() !== newBounds.toBBoxString()) {
          this.fitBounds(newBounds);
      }
    }

    removePolygon(name: string) {
      const poly = this.polygons.get(name);
      if (poly) {
        this.map.removeLayer(poly.leafletPoly);
        this.polygons.delete(name);
      }
    }

    remove(): void {
      if (this.map) {
        this.map.remove();
        this.map = null;
      }
      this.tooltipInstances.forEach((instance) => {
        instance.destroy();
      });
    }

    // Circle
    isValidCircle(data: FormattedData): boolean {
      return data && isNotEmptyStr(data[this.options.circleKeyName]) && isJSON(data[this.options.circleKeyName]);
    }

    convertCircleToCustomFormat(expression: L.LatLng, radius: number): {[key: string]: CircleData} {
      let circleDara: CircleData = null;
      if (expression) {
        const position = checkLngLat(expression, this.southWest, this.northEast);
        circleDara = {
          latitude: position.lat,
          longitude: position.lng,
          radius
        };
      }
      return {
        [this.options.circleKeyName]: circleDara
      };
    }

    convertToCircleFormat(circle: CircleData): CircleData {
      const centerPoint = checkLngLat(new L.LatLng(circle.latitude, circle.longitude), this.southWest, this.northEast);
      circle.latitude = centerPoint.lat;
      circle.longitude = centerPoint.lng;
      return circle;
    }

    dragCircleVertex = (e?, data = {} as FormattedData) => {
      if (e === undefined) {
        return;
      }
      const center = e.layer.getLatLng();
      const radius = e.layer.getRadius();
      this.saveLocation(data, this.convertCircleToCustomFormat(center, radius)).subscribe(() => {});
    }

    updateCircle(circlesData: FormattedData[], updateBounds = true) {
      const toDelete = new Set(Array.from(this.circles.keys()));
      const rawCircles = circlesData.filter(cdata => this.isValidCircle(cdata));
      rawCircles.forEach(data => {
        if (this.circles.get(data.entityName)) {
          this.updatedCircle(data, circlesData, updateBounds);
        } else {
          this.createdCircle(data, circlesData, updateBounds);
        }
        toDelete.delete(data.entityName);
      });
      toDelete.forEach((key) => {
        this.removeCircle(key);
      });
      this.circleData = circlesData;
    }

    updatedCircle(data: FormattedData, dataSources: FormattedData[], updateBounds = true) {
      const circle = this.circles.get(data.entityName);
      const oldBounds = circle.leafletCircle.getBounds();
      circle.updateCircle(data, dataSources);
      const newBounds = circle.leafletCircle.getBounds();
      if (updateBounds && oldBounds.toBBoxString() !== newBounds.toBBoxString()) {
        this.fitBounds(newBounds);
      }
    }

    createdCircle(data: FormattedData, dataSources: FormattedData[], updateBounds = true) {
      const circle = new Circle(this, data, dataSources, this.options, this.dragCircleVertex);
      if (updateBounds) {
        const bounds = circle.leafletCircle.getBounds();
        this.fitBounds(bounds);
      }
      this.circles.set(data.entityName, circle);
    }

    removeCircle(name: string) {
      const circle = this.circles.get(name);
      if (circle) {
        this.map.removeLayer(circle.leafletCircle);
        this.circles.delete(name);
      }
    }
}
