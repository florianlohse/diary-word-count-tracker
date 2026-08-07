const {
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  MarkdownView,
} = require("obsidian");

const SCOPE_FOLDER = "PRIVATE/Diary";
const FRONTMATTER_FIELD = "words_written";
const RESTORE_DELAY_MS = 50; // let Obsidian's own re-render settle before restoring cursor/scroll - verify on-device

const DEFAULT_SETTINGS = {
  pollIntervalSec: 30,
  idleThresholdSec: 4,
};

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
      window.setInterval(
        () => this.pollActiveFile(),
        this.settings.pollIntervalSec * 1000,
      ),
    );
  }

  async pollActiveFile() {
    const file = this.app.workspace.getActiveFile();
    if (!this.inScope(file)) return;
    if (Date.now() - this.lastEditTime < this.settings.idleThresholdSec * 1000)
      return;

    await this.updateWordCount(file);
  }

  inScope(file) {
    return file instanceof TFile && file.path.startsWith(SCOPE_FOLDER + "/");
  }

  async updateWordCount(file) {
    if (!this.app.vault.getAbstractFileByPath(file.path)) return;

    const content = await this.app.vault.read(file);
    const body = this.stripFrontmatter(content);
    const newCount = this.countWords(body);

    const cache = this.app.metadataCache.getFileCache(file);
    const currentCount = cache?.frontmatter?.[FRONTMATTER_FIELD];

    if (currentCount === newCount) return;

    // Capture editor state before the write — processFrontMatter's disk write
    // can reset scroll/cursor to the top when it re-syncs the active editor.
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor =
      activeView?.file?.path === file.path ? activeView.editor : null;
    const savedCursor = editor?.getCursor();
    const savedScroll = editor?.getScrollInfo();

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[FRONTMATTER_FIELD] = newCount;
    });

    if (editor && savedCursor && savedScroll) {
      window.setTimeout(() => {
        // Re-check you're still on the same note before restoring —
        // you may have switched away while the write was in flight.
        const stillActive =
          this.app.workspace.getActiveViewOfType(MarkdownView);
        if (stillActive?.file?.path === file.path) {
          stillActive.editor.setCursor(savedCursor);
          stillActive.editor.scrollTo(savedScroll.left, savedScroll.top);
        }
      }, RESTORE_DELAY_MS);
    }
  }

  stripFrontmatter(content) {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    return match ? content.slice(match[0].length) : content;
  }

  countWords(text) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
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
      .setName("Poll interval (seconds)")
      .setDesc(
        "How often the plugin checks the active diary note. Restarts the timer immediately on change.",
      )
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
      .setDesc(
        "How long since your last keystroke before a poll tick is allowed to write.",
      )
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
  }
}
