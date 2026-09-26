/**
 * Agent Frontmatter Validation Test Suite
 *
 * TRD Tasks: TRD-TEST-086 to TRD-TEST-092
 *
 * Tests to validate agent frontmatter in .md files for the 13 streamlined subagents.
 *
 * Run tests with: npx jest agent-validation.test.js
 *
 * Prerequisites:
 *   npm install --save-dev jest js-yaml
 *
 * Schema Expected:
 *   ---
 *   name: string          # Required, must match filename
 *   description: string   # Required
 *   skills: array         # Optional, YAML array of skill names
 *   ---
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Use js-yaml for parsing frontmatter
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  // Fallback to gray-matter if js-yaml not available
  try {
    yaml = require('gray-matter');
  } catch (e2) {
    console.warn('Neither js-yaml nor gray-matter found. Install with: npm install js-yaml');
  }
}

// =============================================================================
// Constants
// =============================================================================

const AGENTS_DIR = path.join(__dirname, '../../full/agents');

/**
 * Required 13 agents as per TRD constitution and CLAUDE.md
 */
const REQUIRED_AGENTS = [
  'product-manager',
  'technical-architect',
  'spec-planner',
  'frontend-implementer',
  'backend-implementer',
  'mobile-implementer',
  'agent-implementer',
  'verify-app',
  'code-simplifier',
  'code-reviewer',
  'app-debugger',
  'devops-engineer',
  'cicd-specialist'
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse YAML frontmatter from a markdown file.
 * Frontmatter is expected to be between --- delimiters at the start of the file.
 *
 * @param {string} content - The file content
 * @returns {Object|null} Parsed frontmatter object or null if not found/invalid
 */
function parseFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const trimmed = content.trim();

  // Check if file starts with ---
  if (!trimmed.startsWith('---')) {
    return null;
  }

  // Find the closing ---
  const endIndex = trimmed.indexOf('---', 3);
  if (endIndex === -1) {
    return null;
  }

  const yamlContent = trimmed.slice(3, endIndex).trim();

  if (!yamlContent) {
    return null;
  }

  try {
    // Use js-yaml if available
    if (yaml && typeof yaml.load === 'function') {
      return yaml.load(yamlContent);
    }
    // Fallback to gray-matter parsing
    if (yaml && typeof yaml === 'function') {
      const result = yaml(content);
      return result.data;
    }
    // Manual simple parsing if no library available
    return parseSimpleYaml(yamlContent);
  } catch (e) {
    return null;
  }
}

/**
 * Simple YAML parser for basic key-value pairs.
 * Used as fallback when js-yaml is not available.
 *
 * @param {string} yamlContent - The YAML content to parse
 * @returns {Object} Parsed object
 */
function parseSimpleYaml(yamlContent) {
  const result = {};
  const lines = yamlContent.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, colonIndex).trim();
    let value = trimmedLine.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Get all .md files in the agents directory (excluding test files).
 *
 * @returns {string[]} Array of agent filenames (without extension)
 */
function getAgentFiles() {
  try {
    const files = fs.readdirSync(AGENTS_DIR);
    return files
      .filter(f => f.endsWith('.md') && !f.includes('.test.'))
      .map(f => f.replace('.md', ''));
  } catch (e) {
    return [];
  }
}

/**
 * Read and parse an agent file.
 *
 * @param {string} agentName - The agent name (without .md extension)
 * @returns {Object|null} Object with content and frontmatter, or null if not found
 */
function readAgentFile(agentName) {
  const filePath = path.join(AGENTS_DIR, `${agentName}.md`);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    return {
      path: filePath,
      content,
      frontmatter
    };
  } catch (e) {
    return null;
  }
}

// =============================================================================
// TRD-TEST-087: All 13 agent files exist
// =============================================================================

// =============================================================================
// Agent-file integrity -- one assertion per PROPERTY, looped over every file.
//
// This file was 132 tests for 13 markdown files: each property generated its own
// `it()` per agent, beside an already-existing test asserting the same property
// across all of them. Ten tests per file told you nothing the loop did not.
// Collapsed 2026-09-26, owner's call.
//
// What is left is the part that catches an ACCIDENT: a YAML typo that stops an
// agent loading, a rename that leaves `name` disagreeing with the filename, a
// duplicate name that makes dispatch ambiguous. None of those is ever intended.
// =============================================================================

describe('agent files', () => {
  const present = () => getAgentFiles();

  it('every required agent is present', () => {
    expect(present().sort()).toEqual([...REQUIRED_AGENTS].sort());
  });

  it("every agent's frontmatter parses", () => {
    const broken = present().filter((a) => !readAgentFile(a)?.frontmatter);
    expect(broken).toEqual([]);
  });

  it('every agent declares a name and a description', () => {
    const missing = present().filter((a) => {
      const fm = readAgentFile(a)?.frontmatter || {};
      return !fm.name || !fm.description;
    });
    expect(missing).toEqual([]);
  });

  it("every agent's name matches its filename", () => {
    const mismatched = present().filter((a) => readAgentFile(a)?.frontmatter?.name !== a);
    expect(mismatched).toEqual([]);
  });

  it('no two agents share a name', () => {
    const names = present().map((a) => readAgentFile(a)?.frontmatter?.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it('no agent declares a skills: preload — skills are assigned per project', () => {
    // Hardcoded preloads were removed from all 13 agents in 4.1.1 (c4962d0).
    const offenders = present().filter((a) => {
      const raw = fs.readFileSync(path.join(AGENTS_DIR, `${a}.md`), 'utf8');
      const fm = raw.split('---')[1] || '';
      return fm.split('\n').some((l) => /^skills:/.test(l));
    });
    expect(offenders).toEqual([]);
  });

  it('every agent declares background explicitly as a boolean', () => {
    const bad = present().filter((a) => {
      const v = readAgentFile(a)?.frontmatter?.background;
      return v !== 'true' && v !== 'false' && typeof v !== 'boolean';
    });
    expect(bad).toEqual([]);
  });
});

describe('parseFrontmatter helper function', () => {
  it('should parse valid YAML frontmatter', () => {
    const content = `---
name: test-agent
description: A test agent
skills: skill-one, skill-two
---

# Agent Content
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result.name).toBe('test-agent');
    expect(result.description).toBe('A test agent');
    expect(result.skills).toBe('skill-one, skill-two');
  });

  it('should return null for content without frontmatter', () => {
    const content = `# Just a Markdown file

No frontmatter here.
`;
    const result = parseFrontmatter(content);
    expect(result).toBeNull();
  });

  it('should return null for empty content', () => {
    expect(parseFrontmatter('')).toBeNull();
    expect(parseFrontmatter(null)).toBeNull();
    expect(parseFrontmatter(undefined)).toBeNull();
  });

  it('should return null for unclosed frontmatter', () => {
    const content = `---
name: broken
description: Missing closing delimiter
`;
    const result = parseFrontmatter(content);
    expect(result).toBeNull();
  });

  it('should handle frontmatter with only required fields', () => {
    const content = `---
name: minimal-agent
description: Minimal description
---
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result.name).toBe('minimal-agent');
    expect(result.description).toBe('Minimal description');
    expect(result.skills).toBeUndefined();
  });

  it('should handle quoted strings in frontmatter', () => {
    const content = `---
name: "quoted-agent"
description: "Description with: colon"
---
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result.name).toBe('quoted-agent');
    expect(result.description).toBe('Description with: colon');
  });
});

describe('parseSimpleYaml helper function', () => {
  it('should parse basic key-value pairs', () => {
    const yaml = `name: test
description: A test`;
    const result = parseSimpleYaml(yaml);
    expect(result.name).toBe('test');
    expect(result.description).toBe('A test');
  });

  it('should ignore comments', () => {
    const yaml = `# This is a comment
name: test
# Another comment
description: value`;
    const result = parseSimpleYaml(yaml);
    expect(result.name).toBe('test');
    expect(result.description).toBe('value');
    expect(result['# This is a comment']).toBeUndefined();
  });

  it('should handle empty lines', () => {
    const yaml = `name: test

description: value`;
    const result = parseSimpleYaml(yaml);
    expect(result.name).toBe('test');
    expect(result.description).toBe('value');
  });

  it('should remove surrounding quotes', () => {
    const yaml = `name: "quoted"
description: 'single quoted'`;
    const result = parseSimpleYaml(yaml);
    expect(result.name).toBe('quoted');
    expect(result.description).toBe('single quoted');
  });
});

// =============================================================================
// Exports for potential reuse
// =============================================================================

module.exports = {
  REQUIRED_AGENTS,
  AGENTS_DIR,
  parseFrontmatter,
  parseSimpleYaml,
  getAgentFiles,
  readAgentFile
};
