import { describe, expect, it } from 'vitest';
import { designGraphFromSlangAst } from '../src/slang-cli.js';

describe('SlangCliAdapter AST conversion', () => {
  it('builds hierarchy, ports and variables from an elaborated slang AST', () => {
    const ast = {
      design: {
        kind: 'Root',
        members: [{
          kind: 'Instance',
          name: 'top',
          body: {
            kind: 'InstanceBody',
            name: 'top',
            members: [
              { kind: 'Port', name: 'clk', direction: 'In', type: 'logic' },
              { kind: 'Port', name: 'data_o', direction: 'Out', type: 'logic [7:0]' },
              { kind: 'Variable', name: 'count', type: 'logic [7:0]' },
              { kind: 'Instance', name: 'u_child', body: { kind: 'InstanceBody', name: 'child', members: [{ kind: 'Port', name: 'a', direction: 'In', type: 'logic' }] } },
            ],
          },
        }],
      },
    };
    const graph = designGraphFromSlangAst(ast, 'top', ['rtl/top.sv']);
    expect(graph.topModule).toBe('top');
    expect(graph.modules.top.ports.find((p) => p.name === 'data_o')?.width).toBe(8);
    expect(graph.modules.top.signals.find((s) => s.name === 'count')?.isRegister).toBe(true);
    expect(graph.modules.top.instances[0]).toMatchObject({ name: 'u_child', moduleName: 'child' });
    expect(graph.modules.child).toBeDefined();
  });

  it('fails rather than inventing a design when AST has no elaborated instance', () => {
    expect(() => designGraphFromSlangAst({ design: { kind: 'Root', members: [] } }, 'top', ['rtl/top.sv'])).toThrow('did not contain');
  });
});
