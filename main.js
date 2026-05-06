/*
Delayed Daily Note Opener
Opens today's daily note after a configurable delay on startup.
*/

const {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  moment,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  enabled: true,
  delaySeconds: 8,
  commandId: "daily-notes",
  fallbackByPrefix: true,
  showNotice: false,
  skipIfTodayAlreadyOpen: true,
  runRolloverAfterOpen: false,
  rolloverCommandId:
    "obsidian-rollover-daily-todos:obsidian-rollover-daily-todos-rollover",
};

class DelayedDailyNoteOpenerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addSettingTab(new DelayedDailyNoteOpenerSettingTab(this.app, this));

    this.addCommand({
      id: "run-delayed-open-now",
      name: "Run delayed open now",
      callback: async () => {
        await this.runOnce(true);
      },
    });

    this.app.workspace.onLayoutReady(() => {
      if (!this.settings.enabled) return;

      const ms = this.getDelayMs();
      window.setTimeout(async () => {
        await this.runOnce(false);
      }, ms);
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getDelayMs() {
    const seconds = Number(this.settings.delaySeconds);
    if (!Number.isFinite(seconds)) return 8000;
    return Math.max(0, Math.min(120, seconds)) * 1000;
  }

  getDailyNotePathForToday() {
    try {
      const dailyPlugin = this.app.internalPlugins.getPluginById("daily-notes");
      const options = dailyPlugin && dailyPlugin.instance ? dailyPlugin.instance.options : null;

      const folder = options && typeof options.folder === "string" ? options.folder.trim() : "";
      const format = options && typeof options.format === "string" ? options.format : "YYYY-MM-DD";

      const fileName = `${moment().format(format)}.md`;
      return folder ? `${folder}/${fileName}` : fileName;
    } catch (_err) {
      return null;
    }
  }

  isTodayDailyNoteOpen() {
    const todayPath = this.getDailyNotePathForToday();
    if (!todayPath) return false;

    return this.app.workspace
      .getLeavesOfType("markdown")
      .some((leaf) => leaf && leaf.view && leaf.view.file && leaf.view.file.path === todayPath);
  }

  resolveCommandId() {
    const commandId = (this.settings.commandId || "").trim();
    if (!commandId) return null;

    const commands = this.app.commands && this.app.commands.commands ? this.app.commands.commands : {};

    if (commands[commandId]) return commandId;

    if (this.settings.fallbackByPrefix) {
      const ids = Object.keys(commands);
      const directPrefix = ids.find((id) => id.startsWith(`${commandId}:`));
      if (directPrefix) return directPrefix;
    }

    return null;
  }

  executeCommandById(id) {
    try {
      return !!(this.app.commands && this.app.commands.executeCommandById(id));
    } catch (_err) {
      return false;
    }
  }

  async runOnce(fromManualCommand) {
    if (this.settings.skipIfTodayAlreadyOpen && this.isTodayDailyNoteOpen()) {
      if (this.settings.showNotice && fromManualCommand) {
        new Notice("Today's daily note is already open.");
      }
      return;
    }

    const resolvedId = this.resolveCommandId();

    if (!resolvedId) {
      if (this.settings.showNotice || fromManualCommand) {
        new Notice(
          "Daily note command not found. Check command ID in plugin settings (default: daily-notes)."
        );
      }
      return;
    }

    const ok = this.executeCommandById(resolvedId);

    if (!ok) {
      if (this.settings.showNotice || fromManualCommand) {
        new Notice(`Failed to run command: ${resolvedId}`);
      }
      return;
    }

    if (this.settings.runRolloverAfterOpen) {
      const rolloverId = (this.settings.rolloverCommandId || "").trim();
      if (rolloverId) {
        this.executeCommandById(rolloverId);
      }
    }

    if (this.settings.showNotice) {
      new Notice(`Executed: ${resolvedId}`);
    }
  }
}

class DelayedDailyNoteOpenerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Enable delayed opener")
      .setDesc("Run automatic delayed opening of today's daily note on startup")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Delay (seconds)")
      .setDesc("How long to wait after startup before opening today's note (0-120)")
      .addText((text) =>
        text
          .setPlaceholder("8")
          .setValue(String(this.plugin.settings.delaySeconds))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.delaySeconds = Number.isFinite(parsed)
              ? Math.max(0, Math.min(120, parsed))
              : 8;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily note command ID")
      .setDesc(
        "Command ID to open today's daily note. Keep default 'daily-notes' unless you use a custom command."
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.commandId).onChange(async (value) => {
          this.plugin.settings.commandId = (value || "").trim() || "daily-notes";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Fallback by prefix")
      .setDesc("If exact command ID is not found, try first command that starts with '<ID>:'")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.fallbackByPrefix).onChange(async (value) => {
          this.plugin.settings.fallbackByPrefix = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Skip if today's note already open")
      .setDesc("Do not run command if today's daily note is already open in any markdown tab")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.skipIfTodayAlreadyOpen)
          .onChange(async (value) => {
            this.plugin.settings.skipIfTodayAlreadyOpen = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Run rollover after open")
      .setDesc("Optional: run rollover command after opening today's note")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.runRolloverAfterOpen).onChange(async (value) => {
          this.plugin.settings.runRolloverAfterOpen = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Rollover command ID")
      .setDesc(
        "Used only when 'Run rollover after open' is enabled. Example: obsidian-rollover-daily-todos:obsidian-rollover-daily-todos-rollover"
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.rolloverCommandId).onChange(async (value) => {
          this.plugin.settings.rolloverCommandId = value || "";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Show notice")
      .setDesc("Show status notifications when command is executed")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showNotice).onChange(async (value) => {
          this.plugin.settings.showNotice = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Run now").setDesc("Execute delayed open logic immediately")
      .addButton((button) =>
        button.setButtonText("Run now").setCta().onClick(async () => {
          await this.plugin.runOnce(true);
        })
      );
  }
}

module.exports = DelayedDailyNoteOpenerPlugin;
