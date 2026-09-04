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
import {
  AnthropicProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  type ModelProvider,
} from '@nayvid/model-providers';
import { AgentToolGateway, type ToolResult } from '@nayvid/agent-tools';
import { NayvidDoctorService } from '@nayvid/tool-registry';
import {
  DesignHealthEngine,
  FormalAssistant,
  PpaExplorer,
  RegisterMapGenerator,
  TraceabilityMatrix,
  VerificationCockpit,
  VerificationPlanGenerator,
  type DesignHealthInput,
  type DesignHealthReport,
  type FormalProperty,
  type PpaCandidate,
  type PpaComparisonRow,
  type PpaWeights,
  type RegisterMap,
  type RequirementTrace,
  type RequirementTraceResult,
  type VerificationSnapshot,
  type VerificationSummary,
} from '@nayvid/engineering-core';
import type { DesignGraph } from '@nayvid/design-ir';

export type StudioTab =
  | 'rtl'
  | 'design'
  | 'block-diagram'
  | 'schematic'
  | 'fsm'
  | 'waveform'
  | 'navi'
  | 'verification'
  | 'formal'
  | 'synthesis'
  | 'ppa'
  | 'traceability'
  | 'register-map'
  | 'physical'
  | 'doctor';

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

export interface SimulationRequest {
  topModule?: string;
  files: string[];
  output?: string;
  waveformPath: string;
}

export interface NaviRequestOptions {
  cloudApproved?: boolean;
  preferredProviderId?: string;
  modelName?: string;
  requireVision?: boolean;
}

interface AgentGatewayLike {
  executeTool(name: string, args: Record<string, any>, approved?: boolean): Promise<ToolResult>;
}

export interface SiliconStudioDependencies {
  slang?: SlangAdapter;
  verivisual?: VeriVisualEngine;
  router?: ModelFabricRouter;
  contextEngine?: ContextEngine;
  timelineTracker?: AgentTimelineTracker;
  agentGateway?: AgentGatewayLike;
  doctorService?: NayvidDoctorService;
  modelProviders?: ModelProvider[];
}

export class SiliconStudioApp {
  private slang: SlangAdapter;
  private verivisual: VeriVisualEngine;
  private router: ModelFabricRouter;
  private contextEngine: ContextEngine;
  private timelineTracker: AgentTimelineTracker;
  private agentGateway: AgentGatewayLike;
  private doctorService: NayvidDoctorService;
  private verificationCockpit = new VerificationCockpit();
  private designHealth = new DesignHealthEngine();
  private traceability = new TraceabilityMatrix();
  private registerMap = new RegisterMapGenerator();
  private ppa = new PpaExplorer();
  private formal = new FormalAssistant();
  private verificationPlan = new VerificationPlanGenerator();

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

  constructor(deps: SiliconStudioDependencies = {}) {
    this.slang = deps.slang ?? new SlangAdapter();
    this.verivisual = deps.verivisual ?? new VeriVisualEngine();
    this.router = deps.router ?? new ModelFabricRouter();
    this.contextEngine = deps.contextEngine ?? new ContextEngine();
    this.timelineTracker = deps.timelineTracker ?? new AgentTimelineTracker();
    this.agentGateway = deps.agentGateway ?? new AgentToolGateway();
    this.doctorService = deps.doctorService ?? new NayvidDoctorService();

    const providers = deps.modelProviders ?? [
      new OllamaProvider(),
      new OpenAIProvider(),
      new AnthropicProvider(),
      new GeminiProvider(),
    ];
    for (const provider of providers) this.router.registerProvider(provider);
  }

  getIdentity() {
    return { appName: this.state.appName, tagline: this.state.tagline, icons: SubsystemIcons };
  }

  setActiveTab(tab: StudioTab): void { this.state.activeTab = tab; }
  getActiveTab(): StudioTab { return this.state.activeTab; }
  setPrivacyPolicy(policy: PrivacyPolicy): void { this.state.privacyPolicy = policy; }
  getPrivacyPolicy(): PrivacyPolicy { return this.state.privacyPolicy; }
  setActiveSkill(skill: NaviSkill): void { this.state.activeSkill = skill; }
  getActiveSkill(): NaviSkill { return this.state.activeSkill; }

  async openFile(filePath: string, customContent?: string, topModule?: string): Promise<DesignGraph> {
    this.state.activeFilePath = filePath;
    if (customContent !== undefined) {
      this.state.fileContent = customContent;
    } else {
      if (!fs.existsSync(filePath)) throw new Error(`HDL file not found: ${filePath}`);
      this.state.fileContent = fs.readFileSync(filePath, 'utf-8');
    }

    const graph = await this.slang.parseContentToIR(this.state.fileContent, filePath, topModule ?? this.state.topModule);
    if (Object.keys(graph.modules).length === 0) throw new Error(`No HDL modules were parsed from ${filePath}`);
    this.state.designGraph = graph;
    this.state.topModule = graph.topModule;
    return graph;
  }

  async loadDesignGraph(): Promise<DesignGraph> {
    if (!this.state.designGraph) await this.openFile(this.state.activeFilePath);
    return this.state.designGraph!;
  }

  async getDesignNavigator() {
    const graph = await this.loadDesignGraph();
    const modules: Record<string, any> = {};
    for (const [modName, mod] of Object.entries(graph.modules)) {
      modules[modName] = {
        name: mod.name,
        inputs: mod.ports.filter((p) => p.direction === 'input').map((p) => `${p.name} [${Math.max(0, p.width - 1)}:0]`),
        outputs: mod.ports.filter((p) => p.direction === 'output').map((p) => `${p.name} [${Math.max(0, p.width - 1)}:0]`),
        registers: mod.signals.filter((s) => s.isRegister).map((s) => `${s.name} [${Math.max(0, s.width - 1)}:0]`),
        fsms: mod.fsms.map((f) => f.name),
        clockDomains: mod.clockDomains,
        resetDomains: mod.resetDomains,
        instances: mod.instances.map((i) => `${i.name}: ${i.moduleName}`),
      };
    }
    return { topModule: graph.topModule, modules };
  }

  async getBlockDiagram(): Promise<BlockDiagramModel> {
    const graph = await this.loadDesignGraph();
    return this.verivisual.generateBlockDiagram(graph, graph.topModule);
  }

  async runSimulation(request: SimulationRequest): Promise<WaveformModel> {
    const topModule = request.topModule ?? this.state.topModule;
    const activity = this.timelineTracker.addActivity({
      skill: 'verification-engineer',
      toolName: 'run_simulation',
      arguments: { topModule, files: request.files, output: request.output },
      status: 'started',
    });

    const toolRes = await this.agentGateway.executeTool('run_simulation', {
      topModule,
      files: request.files,
      output: request.output,
    });
    if (!toolRes.success) {
      this.timelineTracker.updateActivity(activity.id, { status: 'failed', output: toolRes.error });
      throw new Error(toolRes.error || 'Simulation failed');
    }
    this.timelineTracker.updateActivity(activity.id, { status: 'completed', output: toolRes.output });

    const vcdRes = await this.agentGateway.executeTool('read_waveform', { path: request.waveformPath });
    if (!vcdRes.success) {
      throw new Error(vcdRes.error || `Simulation completed but waveform '${request.waveformPath}' was not available.`);
    }
    const wave = vcdRes.output as WaveformModel;
    this.state.waveform = wave;
    return wave;
  }

  getWaveform(): WaveformModel {
    return this.state.waveform ?? { timescale: '1ns', signals: [], startTimeNs: 0, endTimeNs: 0 };
  }

  async inspectSignal(signalName: string, atTimeNs?: number): Promise<SignalIntelligenceContext> {
    const graph = await this.loadDesignGraph();
    const context = this.verivisual.getSignalContext(signalName, graph, this.state.waveform ?? undefined, atTimeNs);
    this.state.selectedSignal = signalName;
    this.state.selectedSignalContext = context;
    this.timelineTracker.addActivity({
      skill: 'waveform-debugger', toolName: 'inspect_signal', arguments: { signalName, atTimeNs }, status: 'completed', output: context,
    });
    return context;
  }

  async askNavi(query: string, skill: NaviSkill = this.state.activeSkill, options: NaviRequestOptions = {}) {
    const graph = await this.loadDesignGraph();
    const promptCtx = this.contextEngine.buildPromptContext({
      activeFile: { path: this.state.activeFilePath, content: this.state.fileContent },
      designGraph: graph,
      selectedSignal: this.state.selectedSignal ?? undefined,
    });

    this.timelineTracker.addActivity({ skill, toolName: 'inspect_design_context', arguments: { topModule: graph.topModule }, status: 'completed', output: 'Context assembled' });
    const provider = this.router.selectProvider(
      this.state.privacyPolicy,
      options.requireVision ?? false,
      options.cloudApproved ?? false,
      options.preferredProviderId
    );
    const response = await provider.chat([
      { role: 'system', content: `You are NAVI, specialist skill: ${skill}.\n\n${promptCtx}` },
      { role: 'user', content: query },
    ], options.modelName);

    return { answer: response.message.content, contextUsed: promptCtx, providerId: provider.id, toolCalls: response.toolCalls, timeline: this.timelineTracker.getTimeline() };
  }

  async executeToolWithApproval(toolName: string, args: Record<string, any>, approved = false): Promise<ToolResult> {
    const activity = this.timelineTracker.addActivity({ skill: this.state.activeSkill, toolName, arguments: args, status: approved ? 'approved' : 'started' });
    const result = await this.agentGateway.executeTool(toolName, args, approved);
    this.timelineTracker.updateActivity(activity.id, {
      status: result.success ? 'completed' : result.requiresApproval ? 'started' : 'failed',
      output: result.output ?? result.error,
    });
    return result;
  }

  getVerificationSummary(snapshot: VerificationSnapshot): VerificationSummary {
    return this.verificationCockpit.summarize(snapshot);
  }

  getDesignHealth(input: DesignHealthInput): DesignHealthReport {
    if (this.state.designGraph) {
      const graphChecks = this.designHealth.fromDesignGraph(this.state.designGraph);
      input = {
        ...input,
        cdcIssues: input.cdcIssues ?? graphChecks.cdcIssues,
        combinationalLoops: input.combinationalLoops ?? graphChecks.combinationalLoops,
      };
    }
    return this.designHealth.evaluate(input);
  }

  analyzeTraceability(requirements: RequirementTrace[]): RequirementTraceResult[] {
    return this.traceability.analyze(requirements);
  }

  generateRegisterArtifacts(map: RegisterMap) {
    return {
      validation: this.registerMap.validate(map),
      systemVerilog: this.registerMap.generateSystemVerilogPackage(map),
      cHeader: this.registerMap.generateCHeader(map),
      rust: this.registerMap.generateRust(map),
      markdown: this.registerMap.generateMarkdown(map),
    };
  }

  comparePpa(baseline: PpaCandidate, candidates: PpaCandidate[], weights?: PpaWeights): PpaComparisonRow[] {
    return this.ppa.compare(baseline, candidates, weights);
  }

  generateFormalProperty(kind: 'fifo-underflow' | 'fifo-overflow' | 'eventual-response', args: Record<string, any> = {}): FormalProperty {
    if (kind === 'fifo-underflow') return this.formal.fifoNoUnderflow(args.clock, args.reset, args.readEnable, args.empty);
    if (kind === 'fifo-overflow') return this.formal.fifoNoOverflow(args.clock, args.reset, args.writeEnable, args.full);
    return this.formal.eventualResponse(args.request ?? 'req', args.response ?? 'ack', args.maxCycles ?? 8, args.clock, args.reset);
  }

  async generateVerificationPlan(): Promise<string[]> {
    return this.verificationPlan.fromDesignGraph(await this.loadDesignGraph());
  }

  getTimeline(): AgentActivityItem[] { return this.timelineTracker.getTimeline(); }
  clearTimeline(): void { this.timelineTracker.clear(); }
  async runDoctorDiagnostics() { return this.doctorService.runDiagnostics(); }

  getPromptContext(): string {
    return this.contextEngine.buildPromptContext({
      activeFile: { path: this.state.activeFilePath, content: this.state.fileContent },
      designGraph: this.state.designGraph ?? undefined,
      selectedSignal: this.state.selectedSignal ?? undefined,
    });
  }
}
