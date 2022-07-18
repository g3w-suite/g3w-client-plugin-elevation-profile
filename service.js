const {base, inherit} = g3wsdk.core.utils;
const {XHR} = g3wsdk.core.utils;
const {PluginService} = g3wsdk.core.plugin;
const {GUI} = g3wsdk.gui;
const {ChartsFactory} = g3wsdk.gui.vue.Charts;
const t = g3wsdk.core.i18n.tPlugin;

function ElevationProfileService() {
  base(this);
}

inherit(ElevationProfileService, PluginService);

const proto = ElevationProfileService.prototype;

proto.init = function(config={}) {
  this.config              = config;
  this.chartColor          = GUI.skinColor;
  this._mapService         = GUI.getService('map');
  this.queryresultsService = GUI.getService('queryresults');
  this.keySetters          = {
    openCloseFeatureResult: this.queryresultsService.onafter(
      'openCloseFeatureResult', ({open, layer, feature, container}) => {
        const selectedLayer = this.config.layers.find(l => layer.id === l.layer_id);
        if (selectedLayer) {
          this.toggleChartComponent({
            open,
            container,
            layer: selectedLayer,
            fid: feature.attributes['g3w_fid']
          })
        }
      })
  };
  // add "_vue" property to each layer have a reference of the elevation chart element
  if (this.config.layers) {
    this.config.layers.forEach(layer => layer._vue = {});
  }
};

proto.toggleChartComponent = async function({open, layer, container, fid}) {
  let chart = layer._vue[fid];
  if (open) {
    const loadingBar = new (Vue.extend({ template: `<bar-loader :loading="true"></bar-loader>` }))().$mount().$el;
    try {
      container.append(loadingBar);
      const component = await this.getChartComponent({
        api: layer.api,
        layerId: layer.layer_id,
        fid
      });
      chart = new (Vue.extend(component))();
      chart.$once('hook:mounted', async function() {
        container.append(this.$el);
        GUI.emit('resize');
      });
      chart.$mount();
    } catch (error) {
      return error;
    } finally {
      loadingBar.remove();
    }
  } else if (chart) {
    chart.$destroy();
    chart.$el.remove();
    chart = undefined;
  }
};

proto.parseGraphData = function(data) {
  const getMin    = (x1, x2) => x1 < x2 ? x1 : x2;
  const getMax    = (x1, x2) => x1 > x2 ? x1 : x2;
  const graphData = {
    x: ['x'],
    y: ['y'],
    minX:  9999999,
    maxX: -9999999,
    minY:  9999999,
    maxY: -9999999
  };
  for (let i=0; i < data.length; i++) {
    const x = data[i][3];
    const y = data[i][2];
    graphData.minX = getMin(x, graphData.minX);
    graphData.minY = getMin(y, graphData.minY);
    graphData.maxX = getMax(x, graphData.maxX);
    graphData.maxY = getMax(y, graphData.maxY);
    graphData.x.push(x);
    graphData.y.push(y);
  }
  return graphData;
};

proto.getChartComponent = async function({api, layerId, fid}) {
  const data             = await this.getElevationData({api, layerId, fid});
  const graphData        = this.parseGraphData(data);
  const chartColor       = this.chartColor;
  const setMapCenter     = ({index}) => {
    const [x, y] = data[index];
    this._mapService.getMap().getView().setCenter([x,y]);
  };
  const addMapMarker     = ({x, y}) => {
    const point = new ol.geom.Point([x, y]);
    this._mapService.highlightGeometry(point, {
      // TODO: update map marker position instead of removing it
      hide: (callback) => removeMapMarker = callback,
      style: new ol.style.Style({
        image: new ol.style.RegularShape({
          fill: new ol.style.Fill({color: 'white'}),
          stroke: new ol.style.Stroke({color: chartColor, width: 3}),
          points: 3,
          radius: 12,
          angle: 0
        })
      }),
      zoom: false
    });
  };
  let removeMapMarker    = () => {};
  const chartFactoryOpts = {
    type: 'c3:lineXY',
    hooks: {
      created() {
        // update "lineXY.js" config
        this.setConfig({
          // TODO: update map marker position instead of removing it
          onmouseout: removeMapMarker,
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
              x: chartColor,
              y: chartColor
            },
            columns: [
              graphData.x,
              graphData.y
            ],
            // TODO: update map marker position instead of removing it
            onmouseout: removeMapMarker,
            onclick: setMapCenter,
          },
          legend: {
            show: false
          },
          tooltip: {
            format: {
              title: (d) => `${t('eleprofile.chart.tooltip.title')}: ${data[d][3]}`,
            },
            contents: (d) => {
              const [x, y, value] = data[d[0].index];
              addMapMarker({x, y});
              return `<div style="font-weight: bold; border:2px solid; background-color: #ffffff; padding: 3px;border-radius: 3px;" class="skin-border-color skin-color">${value.toFixed(2)} (m)</div>`
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
                format: (value) => value.toFixed(2)
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
                format: (value) => value.toFixed(2)
              }
            }
          }
        });
      }
    }
  };
  return ChartsFactory.build(chartFactoryOpts);
};

proto.getElevationData = async function({api, layerId, fid}) {
  return (await XHR.get({ url: `${api}${layerId}/${fid}` })).profile;
};

proto.clear = function() {
  this.queryresultsService.un('openCloseFeatureResult', this.keySetters.openCloseFeatureResult);
}

export default new ElevationProfileService();
