const {base, inherit} = g3wsdk.core.utils;
const {XHR} = g3wsdk.core.utils;
const {PluginService} = g3wsdk.core.plugin;
const {GUI} = g3wsdk.gui;
const {ChartsFactory} = g3wsdk.gui.vue.Charts;
const t = g3wsdk.core.i18n.tPlugin;

function ElevationProfileService() {
  base(this);
  this.init = function(config={}) {
    this.chartColor = GUI.skinColor;
    this.config = config;
    // add vue property to in add elevention chart element
    this.config.layers && this.config.layers.forEach(layerObj => layerObj._vue = {});
    this._mapService = GUI.getService('map');
    this.keySetters = {};
    const queryresultsComponent = GUI.getComponent('queryresults');
    this.queryresultsService = queryresultsComponent.getService();
    this.keySetters.openCloseFeatureResult = this.queryresultsService.onafter('openCloseFeatureResult', ({open, layer, feature, container})=>{
      const layerObj = this.config.layers.find(layerObj => {
        const {layer_id: layerId} = layerObj;
        return layer.id === layerId;
      });
      layerObj && this.showHideChartComponent({
        open,
        container,
        layerObj,
        fid: feature.attributes['g3w_fid']
      })
    })
  };

  this.getConfig = function(){
    return this.config;
  };

  this.getUrls = function() {
    return this.config.urls;
  };

  this.createLoadingComponentDomElement = function(){
    const loadingComponent = Vue.extend({
      template: `<bar-loader :loading="true"></bar-loader>`
    });
    return new loadingComponent().$mount().$el;
  };

  this.showHideChartComponent = async function({open, layerObj, container, fid}={}) {
    if (open) {
      const {api, layer_id: layerId} = layerObj;
      const barLoadingDom = this.createLoadingComponentDomElement();
      try {
        container.append(barLoadingDom);
        const {component, error} = await this.getChartComponent({api, layerId, fid});
        if (error) return;
        const vueComponentObject = Vue.extend(component);
        layerObj._vue[fid] = new vueComponentObject();
        layerObj._vue[fid].$once('hook:mounted', async function(){
          container.append(this.$el);
          GUI.emit('resize');
        });
        layerObj._vue[fid].$mount();
      } catch (error){
        return error;
      } finally {
        barLoadingDom.remove();
      }
    } else {
      if (layerObj._vue[fid]) {
        layerObj._vue[fid].$destroy();
        layerObj._vue[fid].$el.remove();
        layerObj._vue[fid] = undefined;
      }
    }
  };

  this.getChartComponent = async function({api, layerId, fid}={}) {
    try {
      const response = await this.getElevationData({api, layerId, fid});
      const data = response.result && response.profile;
      if (data) {
        const graphData = {
          x: ['x'],
          y: ['y'],
          minX:  9999999,
          maxX: -9999999,
          minY:  9999999,
          maxY: -9999999
        };
        for (let i=0; i < data.length; i++) {
          const _data = data[i];
          const x = _data[3];
          const y = _data[2];
          graphData.minX = x < graphData.minX ? x : graphData.minX;
          graphData.minY = y < graphData.minY ? y : graphData.minY;
          graphData.maxX = x > graphData.maxX ? x : graphData.maxX;
          graphData.maxY = y > graphData.maxY ? y : graphData.maxY;
          graphData.x.push(x);
          graphData.y.push(y);
        }
        const self = this;
        const map = this._mapService.getMap();
        let hideHightlightFnc = () => {};
        return {
          data,
          id: t('eleprofile.chart.title'),
          component: ChartsFactory.build({
            type: 'c3:lineXY',
            hooks: {
              created() {
                this.setConfig({
                  onmouseout() {
                    hideHightlightFnc()
                  },
                  title: {
                    text: t('eleprofile.chart.title'),
                    position: 'top-center',
                  },
                  padding: {
                    top: 40,
                    bottom: 30,
                    right: 30
                  },
                  zoom: {
                    enabled: true,
                    rescale: true,
                  },
                  data: {
                    selection: {
                      enabled: false,
                      draggable: true
                    },
                    x: 'x',
                    y: 'y',
                    types: {
                      y: 'area'
                    },
                    colors: {
                      x: self.chartColor,
                      y: self.chartColor
                    },
                    columns: [
                      graphData.x,
                      graphData.y
                    ],
                    onmouseout(evt) {
                      hideHightlightFnc();
                    },
                    onclick({index}) {
                      const [x, y] = data[index];
                      map.getView().setCenter([x,y]);
                    },
                  },
                  legend: {
                    show: false
                  },
                  tooltip:{
                    format: {
                      title(d) {
                        return `${t('eleprofile.chart.tooltip.title')}: ${data[d][3]}`
                      },
                    },
                    contents: function (_data, color) {
                      const index = _data[0].index;
                      const [x, y, value] = data[index];
                      const point_geom = new ol.geom.Point(
                        [x, y]
                      );
                      self._mapService.highlightGeometry(point_geom, {
                        zoom: false,
                        hide: function(callback) {
                          hideHightlightFnc = callback;
                        },
                        style: new ol.style.Style({
                          image: new ol.style.RegularShape({
                            fill: new ol.style.Fill({color: 'white' }),
                            stroke: new ol.style.Stroke({color: self.chartColor, width: 3}),
                            points: 3,
                            radius: 12,
                            angle: 0
                          })
                        })
                      });
                      return `<div style="font-weight: bold; border:2px solid; background-color: #ffffff; padding: 3px;border-radius: 3px;" 
                          class="skin-border-color skin-color">${value.toFixed(2)}(m)</div>`
                    }
                  },
                  axis: {
                    x: {
                      max: graphData.maxX + 2,
                      min: graphData.minX - 2,
                      label: {
                        text: t('eleprofile.chart.labels.x'),
                        position: 'outer-center'
                      },
                      tick: {
                        fit: false,
                        count: 4,
                        format: function (value) {
                          return value.toFixed(2);
                        }
                      }
                    },
                    y: {
                      max: graphData.maxY + 5,
                      min: graphData.minY - 5,
                      label: {
                        text: t('eleprofile.chart.labels.y'),
                        position: 'outer-middle'
                      },
                      tick: {
                        count: 5,
                        format: function (value) {
                          return value.toFixed(2);
                        }
                      }
                    }
                  }
                });
              }
            }
          })
        }
      }
    } catch (err) {
      return {
        error: true
      }
    }
  };

  this.getElevationData = async function({api, layerId, fid}={}) {
    const url = `${api}${layerId}/${fid}`;
    const data = {
      result: false
    };
    try {
      const response = await XHR.get({
        url
      });
      data.profile = response.profile;
      data.result = true;
    } catch(error){}
    return data;
  };

  this.clear = function() {
    this.queryresultsService.un('openCloseFeatureResult', this.keySetters.openCloseFeatureResult);
  }
}

inherit(ElevationProfileService, PluginService);

module.exports = new ElevationProfileService;
