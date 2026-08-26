const { Plugin, PluginSettingTab, Setting, TFile, MarkdownView } = require("obsidian");

const {
  FRONTMATTER_FIELD,
  DEFAULT_SETTINGS,
  DEFAULT_SCOPE_FOLDER,
  countWords,
  inScope,
} = require("./core.js");

const RESTORE_DELAY_MS = 50; // let Obsidian's own re-render settle before restoring cursor/scroll

module.exports = class DiaryWordCountTracker extends Plugin {
  async onload() {
    await this.loadSettings();
    this.lastEditTime = 0;
    this.pollIntervalId = null;

    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.lastEditTime = Date.now();
      }),
    );

    this.startPolling();
    this.addSettingTab(new DiaryWordCountSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  startPolling() {
    if (this.pollIntervalId) window.clearInterval(this.pollIntervalId);
    this.pollIntervalId = this.registerInterval(
      window.setInterval(() => this.pollActiveFile(), this.settings.pollIntervalSec * 1000),
    );
  }

  async pollActiveFile() {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || !inScope(file.path, this.settings.scopeFolder)) return;
    if (Date.now() - this.lastEditTime < this.settings.idleThresholdSec * 1000) return;

    await this.updateWordCount(file);
  }

  async updateWordCount(file) {
    if (!this.app.vault.getAbstractFileByPath(file.path)) return;

    const content = await this.app.vault.read(file);
    const newCount = countWords(content, this.settings.footerMarker);

    const cache = this.app.metadataCache.getFileCache(file);
    const currentCount = cache?.frontmatter?.[FRONTMATTER_FIELD];

    if (currentCount === newCount) return;

    // Capture editor state before the write — processFrontMatter's disk write
    // can reset scroll/cursor to the top when it re-syncs the active editor.
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = activeView?.file?.path === file.path ? activeView.editor : null;
    const savedCursor = editor?.getCursor();
    const savedScroll = editor?.getScrollInfo();

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[FRONTMATTER_FIELD] = newCount;
    });

    if (editor && savedCursor && savedScroll) {
      window.setTimeout(() => {
        // Re-check you're still on the same note before restoring — you may
        // have switched away while the write was in flight.
        const stillActive = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (stillActive?.file?.path === file.path) {
          stillActive.editor.setCursor(savedCursor);
          stillActive.editor.scrollTo(savedScroll.left, savedScroll.top);
        }
      }, RESTORE_DELAY_MS);
    }
  }

  onunload() {}
};

class DiaryWordCountSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Target folder")
      .setDesc(
        "Vault-relative folder this plugin tracks notes within (including subfolders). " +
          "Leading/trailing slashes are ignored, so \"" +
          DEFAULT_SCOPE_FOLDER +
          "\" and \"/" +
          DEFAULT_SCOPE_FOLDER +
          "/\" are the same thing. Leave blank to track the entire vault.",
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SCOPE_FOLDER)
          .setValue(this.plugin.settings.scopeFolder)
          .onChange(async (value) => {
            this.plugin.settings.scopeFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Poll interval (seconds)")
      .setDesc("How often the plugin checks the active diary note. Restarts the timer immediately on change.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.pollIntervalSec))
          .setValue(String(this.plugin.settings.pollIntervalSec))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            this.plugin.settings.pollIntervalSec = parsed;
            await this.plugin.saveSettings();
            this.plugin.startPolling();
          }),
      );

    new Setting(containerEl)
      .setName("Idle threshold (seconds)")
      .setDesc("How long since your last keystroke before a poll tick is allowed to write.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.idleThresholdSec))
          .setValue(String(this.plugin.settings.idleThresholdSec))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0) return;
            this.plugin.settings.idleThresholdSec = parsed;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Footer marker")
      .setDesc(
        "Everything below this heading gets ignored by the word count. Matched as a whole " +
          'line, exactly (whitespace-trimmed) — so "##" only matches a line that is exactly ' +
          '"##", not a real heading such as "## Reflections". Case-sensitive. Leave blank to ' +
          "disable.",
      )
      .addText((text) =>
        text
          .setPlaceholder("##")
          .setValue(this.plugin.settings.footerMarker)
          .onChange(async (value) => {
            this.plugin.settings.footerMarker = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
