import { setupL10N, t } from "./libs/l10n";
import zhCN from "./translations/zhCN";
import { EasyMotionManager } from "./easymotion";
import "./pinyin-search"; // 导入拼音搜索功能

let pluginName: string;
let easyMotion: EasyMotionManager | null = null;

export async function load(_name: string) {
  pluginName = _name;

  setupL10N(orca.state.locale, { "zh-CN": zhCN });

  // Initialize EasyMotion
  easyMotion = new EasyMotionManager();
  easyMotion.init();

  console.log(t("your plugin code starts here"));
  console.log("🚀 EasyMotion Plugin 已加载");

  console.log(`${pluginName} loaded.`);
}

export async function unload() {
  // Clean up EasyMotion resources
  if (easyMotion) {
    easyMotion.destroy();
    easyMotion = null;
  }

  console.log("🛑 EasyMotion Plugin 已卸载");
}
