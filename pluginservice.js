const inherit = g3wsdk.core.utils.inherit;
const base = g3wsdk.core.utils.base;
const XHR = g3wsdk.core.utils.XHR;
const PluginService = g3wsdk.core.plugin.PluginService;
const t = g3wsdk.core.i18n.tPlugin;
const GUI = g3wsdk.gui.GUI;
const ComponentsFactory = g3wsdk.gui.ComponentsFactory;
const ChartsFactory = g3wsdk.gui.vue.Charts.ChartsFactory;

function ElevationProfileService() {
  base(this);
  this.init = function(config={}) {
    this.chartColor = GUI.skinColor;
    this.config = config;
    this._mapService = GUI.getComponent('map').getService();
    this.keySetters = {};
    const queryresultsComponent = GUI.getComponent('queryresults');
    this.queryresultsService = queryresultsComponent.getService();
    //usefult to register layer under law
    this.keySetters.addActionLayers = this.queryresultsService.onbefore('addActionsForLayers', (actions={}) => {
      this.config.layers.forEach(layerObj => {
        const {layer_id: layerId} = layerObj;
        if (!actions[layerId]) actions[layerId] = [];
        const layerActions = actions[layerId];
        layerActions.push({
          id: 'showelevation',
          class: GUI.getFontClass('chart'),
          hint: 'plugins.eleprofile.query.actions.showelevation',
          cbk: (layer, feature) => {
            this.showChartComponent({
              layerObj,
              fid: feature.attributes['g3w_fid']
            })
          }
        });
      })
    });
  };

  this.getConfig = function(){
    return this.config;
  };

  this.getUrls = function() {
    return this.config.urls;
  };

  this.showChartComponent = function({layerObj, fid}={}) {
    const {api, layer_id: layerId} = layerObj;
    this.getChartComponent({api, layerId, fid})
      .then(({fid, component:vueComponentObject, error}) => {
        if (error) return;
        else GUI.pushContent({
          id: 'elevation',
          content: ComponentsFactory.build({
            vueComponentObject
          }),
          perc: 50,
          closable: false
        })
      })
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
    this.queryresultsService.un('addActionLayers', this.keySetters.addActionLayers);
  }
}


inherit(ElevationProfileService, PluginService);

module.exports = new ElevationProfileService;
