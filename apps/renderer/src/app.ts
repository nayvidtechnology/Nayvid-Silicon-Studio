import * as fs from 'fs';
import { SlangAdapter } from '@nayvid/hdl-language';
import {
  VeriVisualEngine,
  SubsystemIcons,
  type BlockDiagramModel,
  type WaveformModel,
  type SignalIntelligenceContext,
} from '@nayvid/verivisual';
import {
  ModelFabricRouter,
  ContextEngine,
  AgentTimelineTracker,
  type PrivacyPolicy,
  type NaviSkill,
  type AgentActivityItem,
} from '@nayvid/ai-core';
import { OllamaProvider, OpenAIProvider } from '@nayvid/model-providers';
import { AgentToolGateway, type ToolResult } from '@nayvid/agent-tools';
import { NayvidDoctorService } from '@nayvid/tool-registry';
import type { DesignGraph } from '@nayvid/design-ir';

export type StudioTab = 'rtl' | 'design' | 'schematic' | 'fsm' | 'waveform' | 'navi' | 'verification' | 'doctor';

export interface StudioState {
  appName: string;
  tagline: string;
  activeTab: StudioTab;
  activeFilePath: string;
  fileContent: string;
  topModule: string;
  privacyPolicy: PrivacyPolicy;
  activeSkill: NaviSkill;
  designGraph: DesignGraph | null;
  waveform: WaveformModel | null;
  selectedSignal: string | null;
  selectedSignalContext: SignalIntelligenceContext | null;
}

export class SiliconStudioApp {
  private slang = new SlangAdapter();
  private verivisual = new VeriVisualEngine();
  private router = new ModelFabricRouter();
  private contextEngine = new ContextEngine();
  private timelineTracker = new AgentTimelineTracker();
  private agentGateway = new AgentToolGateway();
  private doctorService = new NayvidDoctorService();

  private state: StudioState = {
    appName: 'Nayvid Silicon Studio',
    tagline: 'AI-native silicon engineering workspace — Design. Verify. Visualize. Build Silicon.',
    activeTab: 'rtl',
    activeFilePath: 'examples/counter/rtl/counter.sv',
    fileContent: '',
    topModule: 'counter',
    privacyPolicy: 'ask-before-cloud',
    activeSkill: 'rtl-engineer',
    designGraph: null,
    waveform: null,
    selectedSignal: null,
    selectedSignalContext: null,
  };

  constructor() {
    this.router.registerProvider(new OllamaProvider());
    this.router.registerProvider(new OpenAIProvider());
  }

  getIdentity() {
    return {
      appName: this.state.appName,
      tagline: this.state.tagline,
      icons: SubsystemIcons,
    };
  }

  setActiveTab(tab: StudioTab): void {
    this.state.activeTab = tab;
  }

  getActiveTab(): StudioTab {
    return this.state.activeTab;
  }

  setPrivacyPolicy(policy: PrivacyPolicy): void {
    this.state.privacyPolicy = policy;
  }

  getPrivacyPolicy(): PrivacyPolicy {
    return this.state.privacyPolicy;
  }

  setActiveSkill(skill: NaviSkill): void {
    this.state.activeSkill = skill;
  }

  getActiveSkill(): NaviSkill {
    return this.state.activeSkill;
  }

  async openFile(filePath: string, customContent?: string): Promise<DesignGraph> {
    this.state.activeFilePath = filePath;
    if (customContent !== undefined) {
      this.state.fileContent = customContent;
    } else if (fs.existsSync(filePath)) {
      this.state.fileContent = fs.readFileSync(filePath, 'utf-8');
    } else {
      this.state.fileContent = `module ${this.state.topModule};\n  input logic clk;\n  input logic rst_n;\n  output logic [7:0] count;\nendmodule`;
    }

    const parseTarget = fs.existsSync(filePath) ? filePath : this.state.fileContent;
    const graph = await this.slang.parseToIR([parseTarget], this.state.topModule);
    this.state.designGraph = graph;
    return graph;
  }

  async loadDesignGraph(): Promise<DesignGraph> {
    if (!this.state.designGraph) {
      await this.openFile(this.state.activeFilePath);
    }
    return this.state.designGraph!;
  }

  async getDesignNavigator(): Promise<{
    topModule: string;
    modules: Record<string, {
      name: string;
      inputs: string[];
      outputs: string[];
      registers: string[];
      fsms: string[];
      clockDomains: string[];
      resetDomains: string[];
      instances: string[];
    }>;
  }> {
    const graph = await this.loadDesignGraph();
    const result: Record<string, any> = {};

    Object.entries(graph.modules).forEach(([modName, mod]) => {
      result[modName] = {
        name: mod.name,
        inputs: mod.ports.filter((p) => p.direction === 'input').map((p) => `${p.name} [${p.width - 1}:0]`),
        outputs: mod.ports.filter((p) => p.direction === 'output').map((p) => `${p.name} [${p.width - 1}:0]`),
        registers: mod.signals.filter((s) => s.isRegister).map((s) => `${s.name} [${s.width - 1}:0]`),
        fsms: mod.fsms.map((f) => f.name),
        clockDomains: mod.clockDomains,
        resetDomains: mod.resetDomains,
        instances: mod.instances.map((i) => `${i.name}: ${i.moduleName}`),
      };
    });

    return {
      topModule: graph.topModule,
      modules: result,
    };
  }

  async getBlockDiagram(): Promise<BlockDiagramModel> {
    const graph = await this.loadDesignGraph();
    return this.verivisual.generateBlockDiagram(graph, this.state.topModule);
  }

  async runSimulation(testName: string = 'tb_counter'): Promise<WaveformModel> {
    const toolRes = await this.agentGateway.executeTool('run_simulation', {
      testName,
      topModule: this.state.topModule,
    });

    this.timelineTracker.addActivity({
      skill: 'verification-engineer',
      toolName: 'run_simulation',
      arguments: { testName, topModule: this.state.topModule },
      status: 'completed',
      output: toolRes.output,
    });

    const vcdRes = await this.agentGateway.executeTool('read_waveform', { path: 'sim.vcd' });
    const waveModel = vcdRes.output as WaveformModel;
    this.state.waveform = waveModel;
    return waveModel;
  }

  getWaveform(): WaveformModel {
    if (!this.state.waveform) {
      this.state.waveform = this.verivisual.parseVcd('');
    }
    return this.state.waveform;
  }

  async inspectSignal(signalName: string, atTimeNs?: number): Promise<SignalIntelligenceContext> {
    const graph = await this.loadDesignGraph();
    const wave = this.getWaveform();
    const context = this.verivisual.getSignalContext(signalName, graph, wave, atTimeNs);
    this.state.selectedSignal = signalName;
    this.state.selectedSignalContext = context;

    this.timelineTracker.addActivity({
      skill: 'waveform-debugger',
      toolName: 'inspect_signal',
      arguments: { signalName, atTimeNs },
      status: 'completed',
      output: context,
    });

    return context;
  }

  async askNavi(
    query: string,
    skill: NaviSkill = this.state.activeSkill
  ): Promise<{
    answer: string;
    contextUsed: string;
    timeline: AgentActivityItem[];
  }> {
    const graph = await this.loadDesignGraph();
    const promptCtx = this.contextEngine.buildPromptContext({
      activeFile: { path: this.state.activeFilePath, content: this.state.fileContent },
      designGraph: graph,
    });

    this.timelineTracker.addActivity({
      skill,
      toolName: 'read_file',
      arguments: { path: this.state.activeFilePath },
      status: 'completed',
      output: `Read ${this.state.activeFilePath}`,
    });

    this.timelineTracker.addActivity({
      skill,
      toolName: 'inspect_module',
      arguments: { moduleName: graph.topModule },
      status: 'completed',
      output: `Inspected DesignGraph for ${graph.topModule}`,
    });

    const provider = this.router.selectProvider(this.state.privacyPolicy);
    const chatRes = await provider.chat([
      { role: 'system', content: `You are NAVI, specialist skill: ${skill}. ${promptCtx}` },
      { role: 'user', content: query },
    ]);

    return {
      answer: chatRes.message.content,
      contextUsed: promptCtx,
      timeline: this.timelineTracker.getTimeline(),
    };
  }

  async executeToolWithApproval(
    toolName: string,
    args: Record<string, any>,
    approved: boolean = false
  ): Promise<ToolResult> {
    const activity = this.timelineTracker.addActivity({
      skill: this.state.activeSkill,
      toolName,
      arguments: args,
      status: approved ? 'approved' : 'started',
    });

    const result = await this.agentGateway.executeTool(toolName, args, approved);

    activity.status = result.success ? 'completed' : result.requiresApproval ? 'started' : 'failed';
    activity.output = result.output || result.error;

    return result;
  }

  getTimeline(): AgentActivityItem[] {
    return this.timelineTracker.getTimeline();
  }

  async runDoctorDiagnostics() {
    return await this.doctorService.runDiagnostics();
  }

  getPromptContext(): string {
    return this.contextEngine.buildPromptContext({
      activeFile: { path: this.state.activeFilePath, content: this.state.fileContent },
      designGraph: this.state.designGraph || undefined,
    });
  }
}
