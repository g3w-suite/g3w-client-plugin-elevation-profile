import pluginConfig from './config';
const {base, inherit} = g3wsdk.core.utils;
const {Plugin} = g3wsdk.core.plugin;
const {addI18nPlugin} = g3wsdk.core.i18n;
const Service = require('./service');

const _Plugin = function() {
  base(this);
  this.name = 'eleprofile';
  this.init = function() {
    // add i18n of the plugin
    addI18nPlugin({
      name: this.name,
      config: pluginConfig.i18n
    });
    // set catalog initial tab
    this.config = this.getConfig();
    this.setService(Service);
    this.service.init(this.config);
    this.registerPlugin(this.config.gid);
    // create API
    this.setReady(true);
  };
  //called when plugin is removed
  this.unload = function() {
    this.service.clear();
  };
};

inherit(_Plugin, Plugin);

(function(plugin){
  plugin.init();
})(new _Plugin);



