import pluginConfig from './config';
import Service from './service';
const {base, inherit} = g3wsdk.core.utils;
const {Plugin:BasePlugin} = g3wsdk.core.plugin;

const Plugin = function() {
  const {name, i18n} = pluginConfig;
  base(this, {
    name,
    service: Service,
    i18n
  });
  if (this.registerPlugin(this.config.gid)) {
    this.service.init(this.config);
  }
  this.setReady(true);
};

inherit(Plugin, BasePlugin);

//called when plugin is removed
Plugin.prototype.unload = function() {
  this.service.clear();
};

new Plugin();


