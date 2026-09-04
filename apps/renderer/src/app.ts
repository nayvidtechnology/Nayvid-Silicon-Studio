import { SlangAdapter } from '@nayvid/hdl-language';
import { VeriVisualEngine, type BlockDiagramModel, type WaveformModel } from '@nayvid/verivisual';
import { ModelFabricRouter, ContextEngine, type PrivacyPolicy } from '@nayvid/ai-core';

export type StudioTab = 'rtl' | 'block-diagram' | 'schematic' | 'fsm' | 'waveform' | 'doctor' | 'navi';

export interface StudioState {
  activeTab: StudioTab;
  activeFilePath: string;
  fileContent: string;
  privacyPolicy: PrivacyPolicy;
}

export class SiliconStudioApp {
  private slang = new SlangAdapter();
  private verivisual = new VeriVisualEngine();
  private _router = new ModelFabricRouter();
  private contextEngine = new ContextEngine();

  private state: StudioState = {
    activeTab: 'rtl',
    activeFilePath: 'rtl/counter.sv',
    fileContent: 'module counter; endmodule',
    privacyPolicy: 'ask-before-cloud',
  };

  setActiveTab(tab: StudioTab): void {
    this.state.activeTab = tab;
  }

  getActiveTab(): StudioTab {
    return this.state.activeTab;
  }

  async loadDesignGraph(): Promise<any> {
    return await this.slang.parseToIR([this.state.activeFilePath], 'counter');
  }

  async getBlockDiagram(): Promise<BlockDiagramModel> {
    const graph = await this.loadDesignGraph();
    return this.verivisual.generateBlockDiagram(graph, 'counter');
  }

  getWaveform(): WaveformModel {
    return this.verivisual.parseVcdSimple('');
  }

  getPromptContext(): string {
    return this.contextEngine.buildPromptContext({
      activeFile: { path: this.state.activeFilePath, content: this.state.fileContent },
    });
  }
}
