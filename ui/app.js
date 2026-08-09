'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  port: null,
  config: null,
  docs: [],           // [{ name, path }] uploaded docs in workspace/documents
  profile: null,      // parsed profile.json (v2 schema)
  editingSection: null, // which profile section is in edit mode
  defaultModel: '',   // "providerID/modelID" currently configured
  providers: { featured: [], connected: [] },
  jobs: [],           // persisted job list (jobs/jobs.json)
  activeJobId: null,  // job open in detail view
  browser: { port: null, jobId: null }, // headed side-by-side session (Settings > Browser Account setup only)
  browserProfileExists: false,           // true only after Google login is confirmed
  browserProfileEmail: null,             // Google account email from profile-meta.json
  autoAnalyzePaste: false,               // Settings toggle: auto-run match after paste-add
  analysisHistory: {},                   // { [jobId]: { job_id, runs: [...] } }
  analysisSnapshots: {},                 // { [jobId]: { [runId]: snapshot } }
  analysisHistoryLoading: {},            // { [jobId]: true }
  scanner: {
    settings: { include_recommended: true, searches: [] },
    feed: [],           // persisted scanner-feed.json (separate from jobs.json)
    running: false,
  },
};

const PROFILE_PATH = 'profile/profile.json';
const DOCS_FOLDER = 'documents';
const ANALYSIS_HISTORY_ROOT = 'jobs/analysis-history';

// ── Deterministic match engine: constants ─────────────────────────────────────
const TECH_BUCKET_MAP = {
  // Programming Languages
  'python': 'Programming Languages', 'typescript': 'Programming Languages',
  'javascript': 'Programming Languages', 'java': 'Programming Languages',
  'c++': 'Programming Languages', 'c#': 'Programming Languages',
  'go': 'Programming Languages', 'golang': 'Programming Languages',
  'rust': 'Programming Languages', 'scala': 'Programming Languages',
  'ruby': 'Programming Languages', 'kotlin': 'Programming Languages',
  'swift': 'Programming Languages', 'r': 'Programming Languages',
  'sql': 'Programming Languages', 'bash': 'Programming Languages',
  'shell': 'Programming Languages', 'php': 'Programming Languages',
  // Frameworks & Libraries
  'fastapi': 'Frameworks & Libraries', 'react': 'Frameworks & Libraries',
  'next.js': 'Frameworks & Libraries', 'nextjs': 'Frameworks & Libraries',
  'streamlit': 'Frameworks & Libraries', 'pytorch': 'Frameworks & Libraries',
  'tensorflow': 'Frameworks & Libraries', 'tf': 'Frameworks & Libraries',
  'xgboost': 'Frameworks & Libraries', 'scikit-learn': 'Frameworks & Libraries',
  'scikit': 'Frameworks & Libraries', 'sklearn': 'Frameworks & Libraries',
  'hugging face': 'Frameworks & Libraries', 'huggingface': 'Frameworks & Libraries',
  'opencv': 'Frameworks & Libraries', 'unstructured': 'Frameworks & Libraries',
  'flask': 'Frameworks & Libraries', 'django': 'Frameworks & Libraries',
  'express': 'Frameworks & Libraries', 'spring': 'Frameworks & Libraries',
  'spring boot': 'Frameworks & Libraries', 'vue': 'Frameworks & Libraries',
  'angular': 'Frameworks & Libraries', 'keras': 'Frameworks & Libraries',
  'pandas': 'Frameworks & Libraries', 'numpy': 'Frameworks & Libraries',
  'scipy': 'Frameworks & Libraries', 'spacy': 'Frameworks & Libraries',
  'transformers': 'Frameworks & Libraries', 'celery': 'Frameworks & Libraries',
  'gradio': 'Frameworks & Libraries', 'peft': 'Frameworks & Libraries',
  'pydantic': 'Frameworks & Libraries',
  // AI / ML
  'llamaindex': 'AI / ML', 'langchain': 'AI / ML', 'ollama': 'AI / ML',
  'openai': 'AI / ML', 'gemini': 'AI / ML', 'anthropic': 'AI / ML',
  'claude': 'AI / ML', 'gpt': 'AI / ML', 'llm': 'AI / ML',
  'rag': 'AI / ML', 'embeddings': 'AI / ML', 'vector search': 'AI / ML',
  'fine-tuning': 'AI / ML', 'fine tuning': 'AI / ML',
  'prompt engineering': 'AI / ML', 'mlflow': 'AI / ML',
  'langsmith': 'AI / ML', 'weaviate': 'AI / ML', 'pinecone': 'AI / ML',
  'chroma': 'AI / ML', 'qdrant': 'AI / ML', 'milvus': 'AI / ML',
  'multimodal': 'AI / ML', 'multi-modal': 'AI / ML',
  'llmops': 'AI / ML', 'llm ops': 'AI / ML', 'vertexai': 'AI / ML',
  'mistral': 'AI / ML', 'mcp': 'AI / ML', 'model context protocol': 'AI / ML',
  'a2a': 'AI / ML', 'agent-to-agent': 'AI / ML', 'agent to agent': 'AI / ML',
  // Agentic Frameworks
  'agno': 'Agentic Frameworks', 'langgraph': 'Agentic Frameworks',
  'autogen': 'Agentic Frameworks', 'crewai': 'Agentic Frameworks',
  'crew.ai': 'Agentic Frameworks', 'semantic kernel': 'Agentic Frameworks',
  'dspy': 'Agentic Frameworks', 'haystack': 'Agentic Frameworks',
  'flowise': 'Agentic Frameworks', 'n8n': 'Agentic Frameworks',
  'claude code': 'Agentic Frameworks', 'github copilot': 'Agentic Frameworks',
  'windsurf': 'Agentic Frameworks', 'cursor': 'Agentic Frameworks',
  // Cloud Platforms
  'aws': 'Cloud Platforms', 'azure': 'Cloud Platforms',
  'gcp': 'Cloud Platforms', 'google cloud': 'Cloud Platforms',
  's3': 'Cloud Platforms', 'ec2': 'Cloud Platforms',
  'lambda': 'Cloud Platforms', 'sagemaker': 'Cloud Platforms',
  'bedrock': 'Cloud Platforms', 'vertex ai': 'Cloud Platforms',
  'cloud run': 'Cloud Platforms', 'azure openai': 'Cloud Platforms',
  'azure ai foundry': 'Cloud Platforms', 'azure ai search': 'Cloud Platforms',
  'azure container apps': 'Cloud Platforms', 'azure kubernetes service': 'Cloud Platforms',
  'azure kubernetes services': 'Cloud Platforms', 'aks': 'Cloud Platforms',
  'glue': 'Cloud Platforms', 'redshift': 'Cloud Platforms',
  'bigquery': 'Cloud Platforms', 'snowflake': 'Cloud Platforms',
  'databricks': 'Cloud Platforms', 'cloudwatch': 'Cloud Platforms',
  // Databases & Storage
  'postgresql': 'Databases & Storage', 'postgres': 'Databases & Storage',
  'pgvector': 'Databases & Storage', 'mysql': 'Databases & Storage',
  'mongodb': 'Databases & Storage', 'redis': 'Databases & Storage',
  'elasticsearch': 'Databases & Storage', 'opensearch': 'Databases & Storage',
  'cassandra': 'Databases & Storage', 'dynamodb': 'Databases & Storage',
  'sqlite': 'Databases & Storage', 'neo4j': 'Databases & Storage',
  'kafka': 'Databases & Storage', 'rabbitmq': 'Databases & Storage',
  // Tools & DevOps
  'docker': 'Tools & DevOps', 'temporal': 'Tools & DevOps',
  'pyspark': 'Tools & DevOps', 'spark': 'Tools & DevOps',
  'git': 'Tools & DevOps', 'proxmox': 'Tools & DevOps',
  'kubernetes': 'Tools & DevOps', 'k8s': 'Tools & DevOps',
  'helm': 'Tools & DevOps', 'terraform': 'Tools & DevOps',
  'ansible': 'Tools & DevOps', 'jenkins': 'Tools & DevOps',
  'github actions': 'Tools & DevOps', 'ci/cd': 'Tools & DevOps',
  'github workflows': 'Tools & DevOps', 'github workflow': 'Tools & DevOps',
  'airflow': 'Tools & DevOps', 'prefect': 'Tools & DevOps',
  'dagster': 'Tools & DevOps', 'hadoop': 'Tools & DevOps',
  'flink': 'Tools & DevOps', 'apache airflow': 'Tools & DevOps',
  'apache kafka': 'Tools & DevOps', 'apache flink': 'Tools & DevOps',
  'grafana': 'Tools & DevOps', 'prometheus': 'Tools & DevOps',
  'nginx': 'Tools & DevOps', 'linux': 'Tools & DevOps',
  'mlops': 'Tools & DevOps', 'llmops': 'Tools & DevOps',
  'llm ops': 'Tools & DevOps', 'ci/cd pipelines': 'Tools & DevOps',
  'playwright': 'Tools & DevOps',
  // Concept / domain terms - JDs use these abstract labels; map them to the
  // bucket where the candidate's concrete implementations live so partial
  // matching fires correctly (e.g. "Deep Learning" → F&L bucket → PyTorch/TF)
  'machine learning': 'Frameworks & Libraries',
  'deep learning': 'Frameworks & Libraries',
  'generative ai': 'AI / ML',
  'llms': 'AI / ML', 'large language models': 'AI / ML',
  'agentic ai': 'Agentic Frameworks', 'ai agents': 'Agentic Frameworks',
  'natural language processing': 'AI / ML',
  'computer vision': 'Frameworks & Libraries',
  'data science': 'Frameworks & Libraries',
  // Vector databases (FAISS, Milvus, etc.) belong with storage
  'faiss': 'Databases & Storage',
};

const SKILL_ALIASES = {
  'ml': 'machine learning', 'nlp': 'natural language processing',
  'k8s': 'kubernetes',      'dl':  'deep learning',
  'tf':  'tensorflow',      'js':  'javascript',
  'ts':  'typescript',      'pg':  'postgresql',
  'genai': 'generative ai', 'gen ai': 'generative ai',
  'cv':  'computer vision', 'scikit': 'scikit-learn',
  'model context protocol': 'mcp', 'agent-to-agent': 'a2a',
  'agent to agent': 'a2a', 'azure kubernetes service': 'aks',
  'azure kubernetes services': 'aks', 'github workflows': 'github actions',
  'github workflow': 'github actions',
};

const SKILL_FAMILIES = {
  // Frontend
  'react': 'frontend', 'next.js': 'frontend', 'nextjs': 'frontend',
  'streamlit': 'frontend', 'angular': 'frontend', 'vue': 'frontend',
  'javascript': 'frontend', 'typescript': 'frontend', 'ag grid': 'frontend',
  'aggrid': 'frontend',
  // Cloud / platforms
  'aws': 'cloud', 'azure': 'cloud', 'gcp': 'cloud', 'google cloud': 'cloud',
  's3': 'cloud', 'ec2': 'cloud', 'lambda': 'cloud', 'sagemaker': 'cloud',
  'bedrock': 'cloud', 'vertex ai': 'cloud', 'cloud run': 'cloud',
  'azure openai': 'cloud', 'azure ai foundry': 'cloud', 'azure ai search': 'cloud',
  'azure container apps': 'cloud', 'aks': 'cloud', 'glue': 'cloud', 'redshift': 'cloud',
  'bigquery': 'cloud', 'snowflake': 'cloud', 'databricks': 'cloud',
  'cloudwatch': 'cloud',
  // Agentic frameworks
  'agno': 'agentic', 'langgraph': 'agentic', 'autogen': 'agentic',
  'crewai': 'agentic', 'crew.ai': 'agentic', 'semantic kernel': 'agentic',
  'dspy': 'agentic', 'haystack': 'agentic', 'flowise': 'agentic', 'n8n': 'agentic',
  'claude code': 'agentic', 'github copilot': 'agentic', 'windsurf': 'agentic',
  'cursor': 'agentic',
  // LLM / RAG stack
  'llamaindex': 'llm', 'langchain': 'llm', 'rag': 'llm',
  'embeddings': 'llm', 'vector search': 'llm', 'llm': 'llm', 'llms': 'llm',
  'large language models': 'llm', 'openai': 'llm', 'anthropic': 'llm',
  'gemini': 'llm', 'claude': 'llm', 'gpt': 'llm', 'prompt engineering': 'llm',
  'mlflow': 'llm', 'langsmith': 'llm', 'llmops': 'llm', 'llm ops': 'llm',
  'generative ai': 'llm', 'modular rag': 'llm', 'mistral': 'llm',
  'mcp': 'llm', 'model context protocol': 'llm', 'a2a': 'llm',
  // ML frameworks / model work
  'pytorch': 'ml', 'tensorflow': 'ml', 'xgboost': 'ml', 'scikit-learn': 'ml',
  'scikit': 'ml', 'sklearn': 'ml', 'hugging face': 'ml', 'huggingface': 'ml',
  'transformers': 'ml', 'keras': 'ml', 'opencv': 'ml', 'spacy': 'ml',
  'machine learning': 'ml', 'deep learning': 'ml', 'natural language processing': 'ml',
  'computer vision': 'ml', 'data science': 'ml',
  // Data infrastructure
  'postgresql': 'data', 'postgres': 'data', 'pgvector': 'data', 'mysql': 'data',
  'mongodb': 'data', 'redis': 'data', 'elasticsearch': 'data',
  'opensearch': 'data', 'cassandra': 'data', 'dynamodb': 'data', 'sqlite': 'data',
  'neo4j': 'data', 'kafka': 'data', 'rabbitmq': 'data', 'snowflake': 'data',
  'databricks': 'data', 'bigquery': 'data', 'redshift': 'data', 'airflow': 'data',
  'pyspark': 'data', 'spark': 'data', 'hadoop': 'data', 'faiss': 'data',
  'pinecone': 'data', 'weaviate': 'data', 'qdrant': 'data',
  // Ops / delivery
  'docker': 'ops', 'kubernetes': 'ops', 'k8s': 'ops', 'helm': 'ops',
  'terraform': 'ops', 'ansible': 'ops', 'jenkins': 'ops', 'github actions': 'ops',
  'ci/cd': 'ops', 'temporal': 'ops', 'cloudwatch': 'ops', 'grafana': 'ops',
  'prometheus': 'ops', 'nginx': 'ops', 'linux': 'ops', 'mlops': 'ops',
  'ci/cd pipelines': 'ops', 'playwright': 'ops',
  // Fine tuning and doc intelligence
  'fine-tuning': 'fine_tuning', 'fine tuning': 'fine_tuning',
  'peft': 'fine_tuning', 'lora': 'fine_tuning', 'qlora': 'fine_tuning',
  'ocr': 'doc_ai', 'unstructured': 'doc_ai', 'multimodal': 'doc_ai',
  'multi-modal': 'doc_ai', 'document intelligence': 'doc_ai', 'vision': 'doc_ai',
  'speech': 'doc_ai', 'api': 'api', 'rest': 'api', 'soap': 'api',
  'rest api architecture': 'api',
};

const FAMILY_TO_CANDIDATE_HINTS = {
  frontend: ['react', 'next.js', 'streamlit', 'javascript', 'typescript', 'angular', 'vue'],
  cloud: ['aws', 'azure', 'gcp', 'google cloud', 'redshift', 'snowflake', 'databricks', 'cloudwatch'],
  agentic: ['agno', 'langgraph', 'autogen', 'crewai', 'semantic kernel', 'dspy', 'haystack'],
  llm: ['llamaindex', 'langchain', 'rag', 'embeddings', 'openai', 'anthropic', 'gemini', 'claude', 'gpt'],
  ml: ['pytorch', 'tensorflow', 'xgboost', 'scikit-learn', 'hugging face', 'transformers', 'keras', 'opencv'],
  data: ['postgresql', 'pgvector', 'redis', 'kafka', 'airflow', 'spark', 'pyspark', 'redshift', 'snowflake'],
  ops: ['docker', 'kubernetes', 'terraform', 'temporal', 'github actions', 'ci/cd', 'jenkins', 'grafana', 'prometheus'],
  fine_tuning: ['fine-tuning', 'peft', 'lora', 'qlora'],
  doc_ai: ['ocr', 'unstructured', 'gemini', 'multimodal', 'document intelligence'],
  api: ['rest api architecture', 'rest', 'soap', 'fastapi', 'flask'],
};

const YEARS_RE = /(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)(?:\s+of)?\s+(?:professional\s+)?experience/i;
const REQUIREMENT_HEADER_RE = /^(required skills?|must[- ]have skills?|technical requirements?|requirements?|preferred skills?|nice to have|good to have|bonus points?)\s*:?\s*$/i;
const HARD_REQUIREMENT_RE = /\b(non-negotiable|must[- ]have|primary cloud|primary language|required as the primary|prior experience is required)\b/i;
const REQUIRED_HINT_RE = /\b(required|required skills?|hands-on experience|strong proficiency|strong expertise|proven ability|solid understanding|demonstrated ability|experience with|experience integrating|experience in|comfortable designing|ability to|expertise in|proficiency in|skills?:)\b/i;
const OPTIONAL_HINT_RE = /\b(nice to have|preferred|bonus|good to have|valuable|similar|familiarity with|plus)\b/i;
const NO_FAMILY_PARTIAL_SKILLS = new Set([
  'azure',
  'azure ai foundry',
  'azure ai search',
  'claude code',
  'mcp',
  'faiss',
  'pinecone',
  'haystack',
  'soap',
  'playwright',
]);
const EXTRA_JOB_SKILLS = [
  'Azure AI Foundry',
  'Azure AI Search',
  'Azure Container Apps',
  'AKS',
  'Claude Code',
  'Model Context Protocol',
  'MCP',
  'FAISS',
  'Pinecone',
  'Haystack',
  'Mistral',
  'Pydantic',
  'Playwright',
  'GitHub Copilot',
  'Windsurf',
  'Cursor',
  'GitHub Workflows',
  'Celery',
  'Redis',
  'A2A',
  'Apache Airflow',
  'Apache Kafka',
  'Apache Flink',
];

// ── Deterministic match engine: core functions ────────────────────────────────

function normalizeSkillToken(str) {
  if (!str) return '';
  const s = str.toLowerCase().trim();
  return SKILL_ALIASES[s] || s;
}

function formatYears(n) {
  if (n == null || Number.isNaN(n)) return '';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function truncateText(text, maxLen = 180) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > maxLen ? `${t.slice(0, maxLen - 1).trimEnd()}…` : t;
}

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function bestEvidenceSnippet(text, terms) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  if (!src) return '';
  const loweredTerms = (Array.isArray(terms) ? terms : [terms])
    .map(t => normalizeSkillToken(t))
    .filter(Boolean);
  const sentences = splitSentences(src);
  for (const sentence of sentences) {
    const low = sentence.toLowerCase();
    if (loweredTerms.some(term => term && low.includes(term))) return truncateText(sentence);
  }
  return truncateText(src);
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skillMentionedInText(text, skill) {
  const hay = String(text || '').toLowerCase();
  const rawNeedle = String(skill || '').toLowerCase().trim();
  const normalizedNeedle = normalizeSkillToken(skill);
  if (!hay || !normalizedNeedle || normalizedNeedle.length < 2) return false;
  const needles = [...new Set([rawNeedle, normalizedNeedle].filter(Boolean))];
  return needles.some(needle => {
    if (/^[a-z0-9]+$/.test(needle) && !needle.includes(' ')) {
      return new RegExp(`\\b${escapeRegex(needle)}\\b`, 'i').test(hay);
    }
    return hay.includes(needle);
  });
}

function classifyRequirementBucket(line, activeBucket = 'neutral') {
  const text = String(line || '').trim();
  if (!text) return activeBucket;
  const low = text.toLowerCase();
  if (OPTIONAL_HINT_RE.test(low)) return 'optional';
  if (HARD_REQUIREMENT_RE.test(low)) return 'required_hard';
  if (REQUIRED_HINT_RE.test(low)) return 'required';
  if (activeBucket === 'required_hard') return 'required';
  if (activeBucket === 'required' || activeBucket === 'optional') return activeBucket;
  return 'neutral';
}

function extractRequirementSegments(job) {
  const segments = [];
  for (const line of (job?.requirements || [])) {
    if (String(line || '').trim()) segments.push({ text: String(line).trim(), bucket: 'required' });
  }
  for (const line of (job?.nice_to_have || [])) {
    if (String(line || '').trim()) segments.push({ text: String(line).trim(), bucket: 'optional' });
  }

  let activeBucket = 'neutral';
  for (const raw of String(job?.description || '').split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    if (REQUIREMENT_HEADER_RE.test(line)) {
      activeBucket = /^preferred|^nice to have|^good to have|^bonus/i.test(line) ? 'optional' : 'required';
      continue;
    }
    if (/^[A-Z][A-Za-z /&-]{2,50}:$/.test(line)) {
      activeBucket = 'neutral';
      continue;
    }
    const bucket = classifyRequirementBucket(line, activeBucket);
    if (bucket !== 'neutral') segments.push({ text: line, bucket });
  }

  return segments;
}

function parseLooseDate(text, endOfPeriod = false) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (/present|current|now/i.test(raw)) return new Date();

  const monthMatch = raw.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})$/i);
  if (monthMatch) {
    const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec']
      .indexOf(monthMatch[1].slice(0, 3).toLowerCase());
    if (monthIdx >= 0) return new Date(Number(monthMatch[2]), monthIdx, endOfPeriod ? 28 : 1);
  }

  const yearMatch = raw.match(/^(\d{4})$/);
  if (yearMatch) return new Date(Number(yearMatch[1]), endOfPeriod ? 11 : 0, endOfPeriod ? 31 : 1);

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function estimateProfileYears(profile) {
  let months = 0;
  for (const exp of (profile?.experience || [])) {
    const start = parseLooseDate(exp.start, false);
    const end = parseLooseDate(exp.end, true) || new Date();
    if (!start || !end || end < start) continue;
    months += ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
  }
  return months > 0 ? months / 12 : null;
}

function extractYearsRequirement(job) {
  const text = [
    job?.title,
    job?.description,
    ...(job?.requirements || []),
    ...(job?.responsibilities || []),
    ...(job?.nice_to_have || []),
  ].filter(Boolean).join('\n');

  const candidates = [];
  const rangeRe = /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+of)?\s+experience/ig;
  const plusRe  = /(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)(?:\s+of)?\s+experience/ig;
  const yearsRe  = /(?:minimum|min\.?|at least|over|more than|required|experience required|experience)\D{0,30}?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+of)?\s+experience/ig;

  let m;
  while ((m = rangeRe.exec(text))) candidates.push(Number(m[1]));
  while ((m = plusRe.exec(text))) candidates.push(Number(m[1]));
  while ((m = yearsRe.exec(text))) candidates.push(Number(m[1]));
  if (!candidates.length) {
    const loose = text.match(YEARS_RE);
    if (loose) candidates.push(Number(loose[1]));
  }

  if (!candidates.length) return { min_years: null, raw: '' };
  return { min_years: Math.max(...candidates), raw: truncateText(text.match(/.{0,120}(?:years?|yrs?)(?:\s+of)?\s+experience.{0,120}/i)?.[0] || '') };
}

function buildEvidenceIndex(profile) {
  const bySkill = new Map();
  const add = (skill, evidence) => {
    const norm = normalizeSkillToken(skill);
    if (!norm) return;
    if (!bySkill.has(norm)) bySkill.set(norm, []);
    const arr = bySkill.get(norm);
    if (arr.length < 4) arr.push(evidence);
  };

  for (const bucket of (profile?.skill_buckets || [])) {
    for (const skill of (bucket.skills || [])) {
      add(skill, {
        source_type: 'profile_skill',
        source_label: bucket.category,
        source_name: skill,
        snippet: `Listed under ${bucket.category}`,
      });
    }
  }

  for (const exp of (profile?.experience || [])) {
    for (const tag of (exp.tags || [])) {
      add(tag, {
        source_type: 'experience_tag',
        source_label: `${exp.title || 'Experience'} at ${exp.company || ''}`.trim(),
        source_name: tag,
        snippet: bestEvidenceSnippet(exp.raw_description || exp.highlights?.join('. ') || '', tag),
      });
    }
  }

  for (const proj of (profile?.projects || [])) {
    for (const tech of (proj.tech || [])) {
      add(tech, {
        source_type: 'project_tech',
        source_label: proj.name || 'Project',
        source_name: tech,
        snippet: bestEvidenceSnippet(proj.raw_description || proj.highlights?.join('. ') || proj.description || '', tech),
      });
    }
    for (const tag of (proj.tags || [])) {
      add(tag, {
        source_type: 'project_tag',
        source_label: proj.name || 'Project',
        source_name: tag,
        snippet: bestEvidenceSnippet(proj.raw_description || proj.highlights?.join('. ') || proj.description || '', tag),
      });
    }
  }

  return bySkill;
}

function familyForToken(tok) {
  return SKILL_FAMILIES[normalizeSkillToken(tok)] || null;
}

function profileEvidenceForSkill(evidenceIndex, skill) {
  return evidenceIndex.get(normalizeSkillToken(skill)) || [];
}

function buildProfileSkillIndex(profile) {
  const byNorm   = new Map(); // normalized → { original, bucket }
  const byBucket = new Map(); // bucket → Set<normalized>

  const addSkill = (skill, bucket) => {
    const norm = normalizeSkillToken(skill);
    if (!norm) return;
    if (!byNorm.has(norm)) byNorm.set(norm, { original: skill, bucket });
    if (!byBucket.has(bucket)) byBucket.set(bucket, new Set());
    byBucket.get(bucket).add(norm);

    // Also index the leading significant token of multi-word skills so that
    // "RAG" in a JD matches "RAG Architecture", "embeddings" matches
    // "Embeddings design and optimization", etc. No bucket check - the alias
    // points to the original skill's bucket for display purposes.
    const firstTok = norm.split(' ')[0];
    if (firstTok && firstTok.length >= 3 && firstTok !== norm && !byNorm.has(firstTok)) {
      byNorm.set(firstTok, { original: skill, bucket });
      byBucket.get(bucket).add(firstTok);
    }
  };

  for (const b of (profile.skill_buckets || [])) {
    for (const skill of (b.skills || [])) addSkill(skill, b.category);
  }
  // Index project tech + experience tags as inferred bucket (partial match only).
  for (const p of (profile.projects || [])) {
    for (const t of (p.tech || [])) addSkill(t, TECH_BUCKET_MAP[normalizeSkillToken(t)] || '_inferred');
  }
  for (const e of (profile.experience || [])) {
    for (const t of (e.tags || [])) addSkill(t, TECH_BUCKET_MAP[normalizeSkillToken(t)] || '_inferred');
  }

  return { byNorm, byBucket };
}

function extractJobSkillTokens(job, profileIndex) {
  const all      = new Set();
  const required = new Set();
  const optional = new Set();

  const reqText  = (job.requirements   || []).join(' ').toLowerCase();
  const optText  = (job.nice_to_have   || []).join(' ').toLowerCase();
  const descText = (job.description    || '').toLowerCase();

  // Phase A - job.skills[] (agent-extracted, most reliable)
  for (const skill of (job.skills || [])) {
    const norm = normalizeSkillToken(skill);
    if (!norm) continue;
    all.add(norm);
    const orig = skill.toLowerCase();
    if (reqText.includes(orig))     required.add(norm);
    else if (optText.includes(orig)) optional.add(norm);
    else required.add(norm); // default: treat as required
  }

  // Phase B - profile skills appearing as substring in requirements prose
  // (catches skills present in prose but not extracted into job.skills[])
  const proseSrc = reqText || descText; // fall back to full description for manual jobs
  for (const [, { original, bucket }] of profileIndex.byNorm) {
    if (bucket === '_inferred') continue;
    const orig = original.toLowerCase();
    if (!proseSrc.includes(orig)) continue;
    const norm = normalizeSkillToken(original);
    if (all.has(norm)) continue; // already from Phase A
    all.add(norm);
    required.add(norm);
  }

  // Phase C - profile skills appearing in nice_to_have prose (optional)
  for (const [, { original, bucket }] of profileIndex.byNorm) {
    if (bucket === '_inferred') continue;
    const orig = original.toLowerCase();
    if (!optText.includes(orig)) continue;
    const norm = normalizeSkillToken(original);
    if (all.has(norm)) continue;
    all.add(norm);
    optional.add(norm);
  }

  return { all, required, optional };
}

function _computeScore(matched, partials, reqGaps) {
  // Denominator includes partials at half-weight so coverage never exceeds 1.0
  const total    = Math.max(1, matched.length + partials.length * 0.5 + reqGaps.length);
  const credit   = matched.length + partials.length * 0.5;
  const coverage = Math.min(1, credit / total);
  const penalty  = reqGaps.length > 4 ? 20 : reqGaps.length > 2 ? 10 : reqGaps.length === 2 ? 5 : 0;
  return Math.max(5, Math.min(95, Math.round(coverage * 100) - penalty));
}

function _computeVerdict(score, reqGaps, screeningRisks = []) {
  const riskPenalty = screeningRisks.reduce((sum, r) => sum + (r.penalty || 0), 0);
  if (score >= 75 && reqGaps.length <= 1 && riskPenalty <= 2) return 'apply_now';
  if (score >= 55 && reqGaps.length <= 4) return 'stretch';
  return 'not_yet';
}

function extractYearsRequirementStrict(job) {
  const text = [
    job?.title,
    job?.description,
    ...(job?.requirements || []),
    ...(job?.responsibilities || []),
    ...(job?.nice_to_have || []),
  ].filter(Boolean).join('\n');

  const candidates = [];
  const rangeRe = /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?/ig;
  const plusRe  = /(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?/ig;
  const yearsRe = /(?:minimum|min\.?|at least|over|more than|required|experience required|experience)\D{0,20}(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/ig;
  const labelRangeRe = /experience\D{0,12}(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/ig;
  const labelPlusRe = /experience\D{0,12}(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/ig;

  let m;
  while ((m = rangeRe.exec(text))) candidates.push(Number(m[1]));
  while ((m = plusRe.exec(text))) candidates.push(Number(m[1]));
  while ((m = yearsRe.exec(text))) candidates.push(Number(m[1]));
  while ((m = labelRangeRe.exec(text))) candidates.push(Number(m[1]));
  while ((m = labelPlusRe.exec(text))) candidates.push(Number(m[1]));
  if (!candidates.length) {
    const loose = text.match(YEARS_RE);
    if (loose) candidates.push(Number(loose[1]));
  }

  if (!candidates.length) return { min_years: null, raw: '' };
  return { min_years: Math.max(...candidates), raw: truncateText(text.match(/.{0,120}(?:experience|years?|yrs?).{0,120}/i)?.[0] || '') };
}

function buildJobSkillLexicon(profileIndex) {
  const byNorm = new Map();
  const add = skill => {
    const norm = normalizeSkillToken(skill);
    if (!norm || norm.length < 2) return;
    const prev = byNorm.get(norm);
    if (!prev || String(skill).length > String(prev).length) byNorm.set(norm, skill);
  };

  Object.keys(TECH_BUCKET_MAP).forEach(add);
  EXTRA_JOB_SKILLS.forEach(add);
  for (const [norm, meta] of profileIndex.byNorm) {
    if (meta.bucket === '_inferred') continue;
    add(meta.original || norm);
  }

  return [...byNorm.values()].sort((a, b) => String(b).length - String(a).length);
}

function extractJobSkillTokensStrict(job, profileIndex) {
  const all      = new Set();
  const required = new Set();
  const optional = new Set();
  const strictRequired = new Set();
  const displayByNorm  = new Map();
  const metaByNorm     = new Map();
  const segments       = extractRequirementSegments(job);
  const lexicon        = buildJobSkillLexicon(profileIndex);

  const recordSkill = (skill, bucket, sourceText = '', strict = false) => {
    const norm = normalizeSkillToken(skill);
    if (!norm) return;
    all.add(norm);
    if (!displayByNorm.has(norm)) displayByNorm.set(norm, skill);

    if (bucket === 'optional') {
      if (!required.has(norm)) optional.add(norm);
      if (!metaByNorm.has(norm)) metaByNorm.set(norm, { bucket: 'optional', source_text: truncateText(sourceText, 220) });
      return;
    }

    required.add(norm);
    optional.delete(norm);
    if (bucket === 'required_hard' || strict) strictRequired.add(norm);
    metaByNorm.set(norm, {
      bucket: bucket === 'required_hard' || strict ? 'required_hard' : 'required',
      source_text: truncateText(sourceText, 220),
    });
  };

  for (const skill of (job.skills || [])) {
    const matchedSegment = segments.find(seg => skillMentionedInText(seg.text, skill));
    recordSkill(
      skill,
      matchedSegment?.bucket || 'required',
      matchedSegment?.text || job.description || '',
      matchedSegment?.bucket === 'required_hard'
    );
  }

  for (const seg of segments) {
    for (const skill of lexicon) {
      if (!skillMentionedInText(seg.text, skill)) continue;
      recordSkill(skill, seg.bucket, seg.text, seg.bucket === 'required_hard');
    }
  }

  return { all, required, optional, strictRequired, displayByNorm, metaByNorm };
}

function canUseFamilyPartial(normTok, family, examples, isStrictRequired = false) {
  if (isStrictRequired) return false;
  if (!examples.length) return false;
  if (NO_FAMILY_PARTIAL_SKILLS.has(normTok)) return false;
  if (family === 'api' && !['fastapi', 'flask', 'django', 'express'].includes(normTok)) return false;
  if (family === 'cloud' && /azure ai|azure container apps|aks/.test(normTok)) return false;
  return true;
}

function computeScoreStrict(matched, partials, reqGaps, hardGapCount = 0) {
  const partialCredit = partials.reduce((sum, pm) => sum + (pm.credit ?? 0.75), 0);
  const total    = Math.max(1, matched.length + partials.length + reqGaps.length);
  const credit   = matched.length + partialCredit;
  const coverage = Math.min(1, credit / total);
  const softGapCount = Math.max(0, reqGaps.length - hardGapCount);
  const penalty = (hardGapCount * 2) + (softGapCount * 0.9) + (reqGaps.length > 6 ? 1.5 : reqGaps.length > 3 ? 0.75 : 0);
  return Math.max(5, Math.min(95, Math.round((coverage * 100) - penalty)));
}

function computeVerdictStrict(score, reqGaps, screeningRisks = [], hardGapCount = 0) {
  const riskPenalty = screeningRisks.reduce((sum, r) => sum + (r.penalty || 0), 0);
  if (hardGapCount >= 2) return score >= 60 && riskPenalty <= 4 ? 'stretch' : 'not_yet';
  if (hardGapCount === 1) return score >= 70 && riskPenalty <= 3 ? 'stretch' : 'not_yet';
  if (score >= 75 && reqGaps.length <= 1 && riskPenalty <= 2) return 'apply_now';
  if (score >= 55 && reqGaps.length <= 4) return 'stretch';
  return 'not_yet';
}

function _rankProjectsByOverlap(projects, jobTokensAll) {
  return (projects || [])
    .map(p => {
      const matchedTech = (p.tech || []).filter(s => jobTokensAll.has(normalizeSkillToken(s)));
      const matchedTags = (p.tags || []).filter(s => jobTokensAll.has(normalizeSkillToken(s)));
      const t = matchedTech.length;
      const g = matchedTags.length;
      const anchor = bestEvidenceSnippet(
        `${p.description || ''}. ${p.raw_description || ''}. ${(p.highlights || []).join('. ')}`,
        [...matchedTech, ...matchedTags]
      );
      return {
        id: p.id,
        name: p.name,
        tech_overlap_count: t,
        matched_tech: matchedTech,
        matched_tags: matchedTags,
        reason: `${t + g} direct signal${(t + g) !== 1 ? 's' : ''} from project stack`,
        evidence: anchor,
        _score: t + g * 0.5,
        talking_points: [],
      };
    })
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)
    .map(({ _score, ...rest }) => rest);
}

function computeMatchDeterministic(profile, job) {
  const profileIndex = buildProfileSkillIndex(profile || {});
  const jobTokens    = extractJobSkillTokensStrict(job || {}, profileIndex);
  const evidenceIndex = buildEvidenceIndex(profile || {});
  const yearsReq = extractYearsRequirementStrict(job || {});
  const estimatedYears = estimateProfileYears(profile || {});

  const skills_matched = [];
  const matchedNorms   = new Set();
  for (const [norm, { original, bucket }] of profileIndex.byNorm) {
    if (bucket === '_inferred') continue; // inferred skills don't count as direct matches
    if (jobTokens.all.has(norm) && !matchedNorms.has(norm)) {
      skills_matched.push(original);
      matchedNorms.add(norm);
    }
  }

  const toDisplayName = tok =>
    jobTokens.displayByNorm.get(tok) ||
    (job.skills || []).find(s => normalizeSkillToken(s) === tok) ||
    tok.replace(/\b\w/g, c => c.toUpperCase());

  const partial_matches   = [];
  const required_gaps     = [];
  const nice_to_have_gaps = [];
  const screening_risks   = [];
  const hardRequiredGaps  = [];

  for (const tok of jobTokens.required) {
    if (matchedNorms.has(tok)) continue;
    const isStrictRequired = jobTokens.strictRequired.has(tok);
    const family = familyForToken(tok);
    if (family) {
      const hints = FAMILY_TO_CANDIDATE_HINTS[family] || [];
      const examples = hints
        .map(h => profileIndex.byNorm.get(normalizeSkillToken(h))?.original)
        .filter(Boolean)
        .slice(0, 2);
      if (canUseFamilyPartial(tok, family, examples, isStrictRequired)) {
        partial_matches.push({
          skill: toDisplayName(tok),
          bucket: TECH_BUCKET_MAP[tok] || family,
          reason: `Has ${examples.join(', ')} in the same ${family.replace('_', ' ')} family`,
          credit: 0.65,
        });
        continue;
      }
    }
    required_gaps.push(toDisplayName(tok));
    if (isStrictRequired) hardRequiredGaps.push(toDisplayName(tok));
  }

  for (const tok of jobTokens.optional) {
    if (matchedNorms.has(tok)) continue;
    if (partial_matches.some(p => normalizeSkillToken(p.skill) === tok)) continue;
    nice_to_have_gaps.push(toDisplayName(tok));
  }

  if (yearsReq.min_years != null) {
    const gap = estimatedYears == null ? null : Math.max(0, yearsReq.min_years - estimatedYears);
    if (gap != null && gap > 0) {
      const penalty = Math.min(10, Math.max(2, Math.round(gap * 2.5)));
      screening_risks.push({
        type: 'experience_years',
        severity: gap >= 3 ? 'high' : gap >= 1.5 ? 'medium' : 'low',
        required_years: yearsReq.min_years,
        estimated_years: Number(formatYears(estimatedYears)),
        gap_years: Number(formatYears(gap)),
        penalty,
        reason: `The job asks for ${formatYears(yearsReq.min_years)}+ years of experience; your profile shows about ${formatYears(estimatedYears)}.`,
      });
    }
  }

  const baseScore = computeScoreStrict(skills_matched, partial_matches, required_gaps, hardRequiredGaps.length);
  const riskPenalty = screening_risks.reduce((sum, r) => sum + (r.penalty || 0), 0);
  const match_score = Math.max(5, Math.min(95, baseScore - riskPenalty));

  const directMatchedSkills = skills_matched.map(skill => {
    const evidence = profileEvidenceForSkill(evidenceIndex, skill)[0] || null;
    return evidence ? {
      skill,
      source_type: evidence.source_type,
      source_label: evidence.source_label,
      source_name: evidence.source_name,
      snippet: evidence.snippet,
    } : { skill, source_type: 'profile_skill', source_label: 'Profile skill buckets', source_name: skill, snippet: 'Matched directly from the profile' };
  });

  const partialEvidence = partial_matches.map(pm => {
    const family = familyForToken(pm.skill);
    const hints = family ? FAMILY_TO_CANDIDATE_HINTS[family] || [] : [];
    const examples = hints
      .map(h => profileIndex.byNorm.get(normalizeSkillToken(h))?.original)
      .filter(Boolean)
      .slice(0, 2);
    return {
      skill: pm.skill,
      family: pm.bucket,
      evidence: examples,
      reason: pm.reason,
    };
  });

  const topProjects = _rankProjectsByOverlap(profile?.projects, jobTokens.all).map(p => ({
    id: p.id,
    name: p.name,
    matched_tech: p.matched_tech || [],
    matched_tags: p.matched_tags || [],
    evidence: p.evidence || '',
    reason: p.reason,
  }));

  const riskText = screening_risks.length
    ? screening_risks.map(r => r.reason).join(' ')
    : 'No explicit years-of-experience filter was detected.';

  return {
    match_score,
    skills_matched,
    partial_matches,
    required_gaps,
    nice_to_have_gaps,
    screening_risks,
    analysis_meta: {
      candidate_years_experience: estimatedYears == null ? null : Number(formatYears(estimatedYears)),
      required_years_experience: yearsReq.min_years == null ? null : Number(formatYears(yearsReq.min_years)),
      years_gap: screening_risks[0]?.gap_years ?? null,
      base_score: baseScore,
      risk_penalty: riskPenalty,
      hard_required_gap_count: hardRequiredGaps.length,
      hard_required_gaps: hardRequiredGaps,
      evidence: {
        matched_skills: directMatchedSkills,
        partial_matches: partialEvidence,
        project_anchors: topProjects,
      },
    },
    apply_readiness: {
      verdict: computeVerdictStrict(match_score, required_gaps, screening_risks, hardRequiredGaps.length),
      reason: hardRequiredGaps.length
        ? `Still missing required skills: ${hardRequiredGaps.slice(0, 3).join(', ')}.`
        : screening_risks.length
        ? riskText
        : (required_gaps.length
            ? `Core skill gaps are still visible in the screen: ${required_gaps.slice(0, 3).join(', ')}.`
            : 'Core required skills are covered directly; screening risk is mostly tied to optional gaps.'),
    },
    relevant_projects: topProjects,
  };
}

async function enrichMatchWithLLM(profile, job, deterministicResult) {
  const det  = deterministicResult;
  const role = [job.title, job.company].filter(Boolean).join(' at ');
  const projectsRef = det.relevant_projects.map(p => ({
    id: p.id,
    name: p.name,
    tech_overlap_count: p.tech_overlap_count,
    matched_tech: p.matched_tech || [],
    matched_tags: p.matched_tags || [],
    evidence: p.evidence || '',
  }));

  const prompt =
    `PRE-COMPUTED ANALYSIS (do not alter skills_matched, required_gaps, nice_to_have_gaps, partial_matches, screening_risks, analysis_meta, or apply_readiness.verdict in your output):\n` +
    `match_score: ${det.match_score}\n` +
    `skills_matched: ${JSON.stringify(det.skills_matched)}\n` +
    `partial_matches: ${JSON.stringify(det.partial_matches)}\n` +
    `required_gaps: ${JSON.stringify(det.required_gaps)}\n` +
    `nice_to_have_gaps: ${JSON.stringify(det.nice_to_have_gaps)}\n` +
    `screening_risks: ${JSON.stringify(det.screening_risks || [])}\n` +
    `analysis_meta: ${JSON.stringify(det.analysis_meta || {}, null, 2)}\n` +
    `apply_readiness.verdict: "${det.apply_readiness.verdict}"\n` +
    `relevant_projects (ordered by relevance): ${JSON.stringify(projectsRef)}\n\n` +
    `EVIDENCE RULES:\n` +
    `- Every summary, gap, and talking point must be grounded in one of the evidence items from analysis_meta.evidence or an exact project/raw_description snippet.\n` +
    `- Do not use generic filler such as "strong", "aligns well", or "directly relevant" unless immediately followed by the exact proof point.\n` +
    `- If you cannot cite a project, experience item, or exact profile skill, omit the claim.\n\n` +
    `FULL PROFILE:\n${JSON.stringify(profile, null, 2)}\n\n` +
    (role ? `ROLE: ${role}\n\n` : '') +
    `JOB DESCRIPTION:\n${job.description || ''}`;

  let enrichment;
  try {
    enrichment = await runAgentToFile('jd-match', prompt);
  } catch (_) {
    return det; // enrichment failure → return deterministic result as-is
  }

  const clampedScore = Math.max(5, Math.min(95,
    Math.max(det.match_score - 5, Math.min(det.match_score + 5, enrichment.match_score ?? det.match_score))
  ));
  const mergedProjects = det.relevant_projects.map(p => ({
    ...p,
    talking_points: (enrichment.relevant_projects || []).find(e => e.id === p.id)?.talking_points || [],
  }));

  return {
    ...det,
    ...enrichment,
    match_score:       clampedScore,
    apply_readiness:   { verdict: det.apply_readiness.verdict, reason: det.apply_readiness?.reason || enrichment.apply_readiness?.reason || '' },
    skills_matched:    det.skills_matched,
    partial_matches:   det.partial_matches,
    required_gaps:     det.required_gaps,
    nice_to_have_gaps: det.nice_to_have_gaps,
    screening_risks:   det.screening_risks || [],
    analysis_meta:     det.analysis_meta || {},
    relevant_projects: mergedProjects,
  };
}

function emptyProfile() {
  return {
    identity:     { name: '', headline: '', summary: '', location: '' },
    contact:      { email: '', phone: '', links: [] },
    skill_buckets: [],
    experience:   [],
    projects:     [],
    education:    [],
    certifications: [],
    publications: [],
  };
}

// ── Bridge (Core) ─────────────────────────────────────────────────────────────
const bridge = (() => {
  const call = (m, ...a) => window.pywebview.api[m](...a).catch(e => { console.error(`bridge.${m}`, e); throw e; });
  return {
    getConfig:        ()             => call('get_config'),
    workspaceTree:    ()             => call('workspace_tree'),
    workspaceList:    (folder)       => call('workspace_list', folder),
    workspaceRead:    (path)         => call('workspace_read', path),
    workspaceWrite:   (path, text)   => call('workspace_write', path, text),
    workspaceDelete:  (path)         => call('workspace_delete', path),
    getProviders:     ()             => call('get_providers'),
    saveProviderKey:  (pid, key)     => call('save_provider_key', pid, key),
    removeProviderKey:(pid)          => call('remove_provider_key', pid),
    setDefaultModel:  (pid, mid)     => call('set_default_model', pid, mid),
    openExternal:     (url)          => call('open_external', url),
    exportResumePdf:  (html, fname, dir) => call('export_pdf', html, fname, dir || ''),
    openFolderDialog: ()             => call('open_folder_dialog'),
    browserOpen:              (url) => call('browser_open', url),
    browserScrape:            (url) => call('browser_scrape', url),
    browserClose:             ()    => call('browser_close'),
    browserGetProfileStatus:  ()    => call('browser_get_profile_status'),
    browserSetupProfile:      ()    => call('browser_setup_profile'),
    browserCheckGoogleLogin:  ()    => call('browser_check_google_login'),
    browserResetProfile:      ()    => call('browser_reset_profile'),
    createSession:            (title = '') => call('create_session', title),
    sendMessage:              (sessionId, agent, model, text) =>
      call('send_message', sessionId, agent || '', model || null, text),
    sessionHistory:           (sessionId) => call('session_history', sessionId),
    scannerRun:           ()          => call('scanner_run'),
    scannerGetFeed:       ()          => call('scanner_get_feed'),
    scannerGetSettings:   ()          => call('scanner_get_settings'),
    scannerSaveSettings:  (settings)  => call('scanner_save_settings', settings),
    scannerPromote:       (jobId)     => call('scanner_promote', jobId),
    scannerDismiss:       (jobId)     => call('scanner_dismiss', jobId),
  };
})();

// ── Spiritus agent runner ─────────────────────────────────────────────────────
async function runAgentPrompt(agentId, promptText) {
  const session = await bridge.createSession();
  const parts = new Map();
  let eventSource;
  let settled = false;

  const close = () => {
    if (eventSource) eventSource.close();
    eventSource = null;
  };

  const result = new Promise((resolve, reject) => {
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      close();
      if (error) reject(error);
      else resolve(value);
    };

    eventSource = new EventSource(`/api/events?session_id=${encodeURIComponent(session.id)}`);
    eventSource.onmessage = (message) => {
      let event;
      try { event = JSON.parse(message.data); } catch (_) { return; }
      if (event.session_id !== session.id) return;
      if (event.type === 'text.delta') {
        parts.set(event.part_id, (parts.get(event.part_id) || '') + (event.text || ''));
      } else if (event.type === 'text.snapshot') {
        parts.set(event.part_id, event.text || '');
      } else if (event.type === 'run.failed') {
        finish(new Error(event.message || `Agent ${agentId} failed`));
      } else if (event.type === 'run.idle') {
        finish(null, [...parts.values()].join(''));
      }
    };
    eventSource.onerror = () => finish(new Error('Spiritus event stream failed'));
  });

  try {
    await new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (eventSource?.readyState === EventSource.OPEN) resolve();
        else if (eventSource?.readyState === EventSource.CLOSED) reject(new Error('Spiritus event stream closed'));
        else if (Date.now() - started > 10000) reject(new Error('Spiritus event stream timed out'));
        else setTimeout(check, 25);
      };
      check();
    });
    await bridge.sendMessage(session.id, agentId, null, promptText);
  } catch (error) {
    close();
    throw error;
  }
  return result;
}

// ── Documents ──────────────────────────────────────────────────────────────────
function isTextFile(name) {
  return /\.(txt|md|markdown|json)$/i.test(name);
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const f of files) {
    if (!isTextFile(f.name)) {
      showToast(`Skipped ${f.name} - text files only in V0 (.txt/.md/.json)`);
      continue;
    }
    try {
      const text = await f.text();
      await bridge.workspaceWrite(`${DOCS_FOLDER}/${f.name}`, text);
    } catch (e) {
      showToast(`Could not read ${f.name}`);
    }
  }
  await refreshDocs();
}

async function refreshDocs() {
  try {
    state.docs = await bridge.workspaceList(DOCS_FOLDER) || [];
  } catch (_) {
    state.docs = [];
  }
  renderDocs();
  updateGenerateEnabled();
}

function renderDocs() {
  const el = document.getElementById('doc-list');
  if (!state.docs.length) { el.innerHTML = ''; return; }
  el.innerHTML = state.docs.map(d => `
    <div class="doc-item">
      <sl-icon library="lucide" name="file-text"></sl-icon>
      <span class="doc-name" title="${escAttr(d.name)}">${escHtml(d.name)}</span>
      <button class="doc-del" data-path="${escAttr(d.path)}" title="Remove">&times;</button>
    </div>
  `).join('');
}

function updateGenerateEnabled() {
  const hasPaste = document.getElementById('paste-text').value.trim().length > 20;
  const hasDocs = state.docs.length > 0;
  document.getElementById('btn-generate').disabled = !(hasPaste || hasDocs);
}

async function gatherResumeText() {
  const parts = [];
  const pasted = document.getElementById('paste-text').value.trim();
  if (pasted) parts.push(pasted);
  for (const d of state.docs) {
    try {
      const res = await bridge.workspaceRead(d.path);
      if (res && res.content) parts.push(`# Document: ${d.name}\n${res.content}`);
    } catch (_) {}
  }
  return parts.join('\n\n---\n\n').trim();
}

// ── Profile: sub-view ────────────────────────────────────────────────────────
function showProfileSubview(name) {
  ['main', 'ingest', 'export'].forEach(n =>
    document.getElementById(`profile-${n}`)?.classList.toggle('hidden', n !== name));
  // The export flow needs the full window width; the other subviews keep the
  // narrower reading width.
  document.getElementById('view-profile')?.classList.toggle('view-wide', name === 'export');
  syncChrome('profile', { section: name });
}

// ── Profile: load ─────────────────────────────────────────────────────────────
async function loadProfile() {
  try {
    const res = await bridge.workspaceRead(PROFILE_PATH);
    if (res && res.content && !res.error) {
      state.profile = { ...emptyProfile(), ...JSON.parse(res.content) };
      updateSidebarPersona();
      return true;
    }
  } catch (_) {}
  updateSidebarPersona();
  return false;
}

// ── Profile: merge (deterministic - agent extracts, app merges) ───────────────
function mergeProfile(existing, extracted) {
  const merged = JSON.parse(JSON.stringify(existing));
  const ext = { ...emptyProfile(), ...extracted };

  for (const k of ['name', 'headline', 'summary', 'location']) {
    if (ext.identity?.[k]) merged.identity[k] = ext.identity[k];
  }
  if (ext.contact?.email) merged.contact.email = ext.contact.email;
  if (ext.contact?.phone) merged.contact.phone = ext.contact.phone;
  for (const link of (ext.contact?.links || [])) {
    if (link.url && !merged.contact.links.some(l => l.url === link.url))
      merged.contact.links.push(link);
  }
  for (const nb of (ext.skill_buckets || [])) {
    if (!nb.category || !nb.skills?.length) continue;
    const eb = merged.skill_buckets.find(
      b => b.category.toLowerCase() === nb.category.toLowerCase()
    );
    if (eb) {
      for (const s of nb.skills) { if (!eb.skills.includes(s)) eb.skills.push(s); }
    } else {
      merged.skill_buckets.push({ category: nb.category, skills: [...nb.skills] });
    }
  }
  const ts = Date.now();
  for (const [i, e] of (ext.experience || []).entries()) {
    if (e.title || e.company) merged.experience.push({ ...e, id: `${ts}e${i}` });
  }
  for (const [i, p] of (ext.projects || []).entries()) {
    if (p.name) merged.projects.push({ ...p, id: `${ts}p${i}` });
  }
  for (const ed of (ext.education || [])) {
    if (ed.degree || ed.institution) merged.education.push(ed);
  }
  for (const c of (ext.certifications || [])) {
    if (c.name) merged.certifications.push(c);
  }
  for (const p of (ext.publications || [])) {
    if (p.title) merged.publications.push(p);
  }
  return merged;
}

// ── Agent reply parsing ───────────────────────────────────────────────────────
// Agents return JSON, sometimes wrapped in a markdown fence or surrounded by
// prose. Strip the fence and slice to the outermost braces, then parse.
function parseAgentJson(text) {
  let t = (text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

async function extractAndMerge() {
  const text = await gatherResumeText();
  if (!text) { showToast('Add a document or paste text first.'); return; }
  setGenerating(true);
  try {
    const reply = await runAgentPrompt('profile', 'Documents:\n\n' + text);
    let extracted;
    try { extracted = parseAgentJson(reply); }
    catch (_) { showToast('Could not parse extraction - try again.'); return; }

    state.profile = mergeProfile(state.profile || emptyProfile(), extracted);
    await bridge.workspaceWrite(PROFILE_PATH, JSON.stringify(state.profile, null, 2));
    updateSidebarPersona();
    state.editingSection = null;
    renderProfileSections();
    showProfileSubview('main');
    showToast('Profile updated.');
  } catch (e) {
    showToast(`Extraction failed: ${e.message}`);
  } finally {
    setGenerating(false);
  }
}

function setGenerating(on) {
  const btn = document.getElementById('btn-generate');
  btn.loading = on;
  btn.disabled = on || btn.disabled;
  if (!on) updateGenerateEnabled();
  // Freeze the inputs so nothing changes mid-extraction.
  document.getElementById('paste-text').disabled = on;
  document.getElementById('file-input').disabled = on;
  const s = document.getElementById('gen-status');
  s.classList.toggle('hidden', !on);
  if (on) s.textContent = 'Reading your documents and updating the profile… this can take a minute.';
}

// ── Profile: section rendering ────────────────────────────────────────────────
const SECTION_META = {
  identity:       { icon: 'user-round',      label: 'Identity' },
  contact:        { icon: 'at-sign',         label: 'Contact & Links' },
  skills:         { icon: 'layers-3',        label: 'Skills' },
  experience:     { icon: 'briefcase',       label: 'Experience' },
  projects:       { icon: 'folder-open',     label: 'Projects' },
  education:      { icon: 'graduation-cap',  label: 'Education' },
  certifications: { icon: 'award',           label: 'Certifications' },
  publications:   { icon: 'book-open',       label: 'Publications' },
};

function hasProfileData(p) {
  if (!p) return false;
  return !!(p.identity?.name || (p.skill_buckets||[]).length ||
            (p.experience||[]).length || (p.projects||[]).length);
}

function renderProfileSections() {
  const p = state.profile;
  const empty    = document.getElementById('profile-empty-state');
  const sections = document.getElementById('profile-sections');
  if (!hasProfileData(p)) {
    empty.classList.remove('hidden'); sections.classList.add('hidden'); return;
  }
  empty.classList.add('hidden'); sections.classList.remove('hidden');
  sections.innerHTML = renderProfileStrength(p) +
    Object.keys(SECTION_META).map(renderSection).join('');
}

// ── Profile-based resume export ──────────────────────────────────────────────
// A resume built from the profile alone, with no job attached. You choose which
// entries and which individual bullets go on the page, and the preview tells you
// live whether it still fits one page. Bullets can be rewritten with AI, but
// only ever grounded in the raw notes already stored on that entry — the model
// is never given licence to invent a new claim here.
const exportState = {
  include: {},        // { [sectionKey]: bool }
  entries: {},        // { [`exp:${id}`|`proj:${id}`]: bool }
  bullets: {},        // { [`exp:${id}`]: Set(bulletIndex) }
  rewritten: {},      // { [`exp:${id}:${i}`]: "current text" }
  // Scratch ledger for this export session only: what each bullet originally
  // said, every version since, and how many times it changed. It exists so a
  // rewrite can be told what the other bullets already cover (and what an
  // earlier attempt already said) instead of blindly restating them. Cleared
  // when the flow opens and again once a PDF is written.
  rewriteLog: {},     // { [`exp:${id}:${i}`]: { original, versions: [], count } }
  guiding: null,      // key of the bullet currently showing a guidance box
  order: [],          // section order for this export ([] = default)
  entryOrder: { exp: [], proj: [] },  // display order of entry ids per kind ([] = profile order)
  bulletOrder: {},    // { [`exp:${id}`|`proj:${id}`]: [ref,...] } — ref is a highlight
                       // index (number) or a custom-bullet key (string, see `custom`)
  custom: {},         // { [`exp:${id}`|`proj:${id}`]: { [customKey]: "text" } } — bullets
                       // typed directly into this export, not backed by a profile highlight
  customSeq: 0,       // counter for unique custom-bullet keys this session
  summaryText: null,  // rewritten summary for this export (null = profile's own)
  jobId: null,        // set when tailoring for a specific job, else null
  extraSkills: new Set(),  // JD-suggested skills to add to the resume only
};

const EXPORT_SECTIONS = [
  { key: 'summary',        label: 'Profile summary' },
  { key: 'experience',     label: 'Work experience' },
  { key: 'projects',       label: 'Projects' },
  { key: 'skills',         label: 'Skills' },
  { key: 'education',      label: 'Education' },
  { key: 'publications',   label: 'Publications' },
  { key: 'certifications', label: 'Certifications' },
];

function entryKey(kind, id) { return `${kind}:${id}`; }

// A bullet ref is either a highlight index (number, "5") or a custom-bullet
// key (string, "c5") - decide which from the attribute text.
function parseExportBulletRef(refStr) {
  return refStr.startsWith('c') ? refStr : Number(refStr);
}

// Effective bullet text for an entry: a rewritten version if one exists,
// otherwise the stored highlight.
function exportBulletText(kind, id, idx, original) {
  return exportState.rewritten[`${kind}:${id}:${idx}`] ?? original;
}

// Text for a bullet "ref": a highlight index (number) resolves through the
// rewrite path above, a custom-bullet key (string) reads straight from the
// typed-in text — there's no "original" to fall back to.
function bulletRefText(kind, id, ref, item) {
  if (typeof ref === 'string') return exportState.custom[entryKey(kind, id)]?.[ref] ?? '';
  return exportBulletText(kind, id, ref, (item.highlights || [])[ref]);
}

// Every bullet available on an entry: its profile highlights (by index) plus
// any bullets typed directly into this export session (by custom key).
function allBulletRefs(kind, id, item) {
  const origLen = (item.highlights || []).length;
  const origRefs = Array.from({ length: origLen }, (_, i) => i);
  const customRefs = Object.keys(exportState.custom[entryKey(kind, id)] || {});
  return [...origRefs, ...customRefs];
}

// Display order for an entry's bullets. Self-healing: drops refs that no
// longer exist (a removed custom bullet) and appends any new ones (a freshly
// added bullet, or the first render) at the end.
function bulletOrderFor(k, refs) {
  const arr = (exportState.bulletOrder[k] || []).filter(r => refs.includes(r));
  for (const r of refs) if (!arr.includes(r)) arr.push(r);
  exportState.bulletOrder[k] = arr;
  return arr;
}

// Display order for a kind's entries (ids). Same self-healing behaviour as
// bulletOrderFor, keyed on entry id instead of bullet ref.
function entryOrderFor(kind, ids) {
  const arr = (exportState.entryOrder[kind] || []).filter(id => ids.includes(id));
  for (const id of ids) if (!arr.includes(id)) arr.push(id);
  exportState.entryOrder[kind] = arr;
  return arr;
}

// A kind's items (experience or projects) in the user's chosen display order.
function orderedItems(kind, list) {
  const ids = list.map(x => String(x.id));
  const order = entryOrderFor(kind, ids);
  const byId = new Map(list.map(x => [String(x.id), x]));
  return order.map(id => byId.get(id)).filter(Boolean);
}

function initExportState() {
  const p = state.profile || {};
  exportState.include = {};
  exportState.entries = {};
  exportState.bullets = {};
  exportState.rewritten = {};
  exportState.rewriteLog = {};
  exportState.guiding = null;
  exportState.order = [...RESUME_SECTION_ORDER];
  exportState.entryOrder = { exp: [], proj: [] };
  exportState.bulletOrder = {};
  exportState.custom = {};
  exportState.customSeq = 0;
  exportState.summaryText = null;
  exportState.extraSkills = new Set();

  for (const s of EXPORT_SECTIONS) {
    // Default on for anything that actually has content.
    const has = {
      summary: !!(p.identity || {}).summary,
      experience: (p.experience || []).length > 0,
      projects: (p.projects || []).length > 0,
      skills: (p.skill_buckets || []).length > 0,
      education: (p.education || []).length > 0,
      publications: (p.publications || []).length > 0,
      certifications: (p.certifications || []).length > 0,
    }[s.key];
    exportState.include[s.key] = !!has;
  }

  // Start from the same shape the one-page layout expects: all roles with their
  // first few bullets, projects kept tighter.
  (p.experience || []).forEach((e, i) => {
    const k = entryKey('exp', e.id);
    exportState.entries[k] = i < RESUME_LIMITS.expEntries;
    exportState.bullets[k] = new Set(
      (e.highlights || []).map((_, bi) => bi).slice(0, RESUME_LIMITS.expBullets));
  });
  (p.projects || []).forEach((pr, i) => {
    const k = entryKey('proj', pr.id);
    exportState.entries[k] = i < RESUME_LIMITS.projEntries;
    exportState.bullets[k] = new Set(
      (pr.highlights || []).map((_, bi) => bi).slice(0, RESUME_LIMITS.projBullets));
  });
}

// Turn the selection into the same draft shape renderResumeHTML already
// consumes, so the export path reuses the exact renderer and PDF pipeline the
// job-specific resume uses. Caps are disabled here because the selection IS the
// cap — otherwise the renderer would silently drop what you deliberately chose.
function buildExportDraft() {
  const p = state.profile || {};
  const inc = exportState.include;

  // Bullets appear in the user's chosen order (default: profile order, then
  // any added bullets at the end), not just the ones that are selected.
  const buildList = (kind, list) => orderedItems(kind, list)
    .filter(item => exportState.entries[entryKey(kind, item.id)])
    .map(item => {
      const k = entryKey(kind, item.id);
      const refs = allBulletRefs(kind, item.id, item);
      const order = bulletOrderFor(k, refs);
      const selected = exportState.bullets[k] || new Set();
      const picked = order.filter(r => selected.has(r));
      return { id: item.id, bullets: picked.map(r => bulletRefText(kind, item.id, r, item)).filter(Boolean) };
    });

  const experience = buildList('exp', p.experience || []);
  const projects = buildList('proj', p.projects || []);

  return {
    summary: inc.summary
      ? (exportState.summaryText != null ? exportState.summaryText : ((p.identity || {}).summary || ''))
      : '',
    skills: inc.skills
      ? [...new Set([...(p.skill_buckets || []).flatMap(b => b.skills || []),
                     ...exportState.extraSkills])]
      : [],
    experience: inc.experience ? experience : [],
    projects: inc.projects ? projects : [],
  };
}

// The renderer pulls education/publications straight from the profile, so to
// honour the include toggles we hand it a shallow copy with those emptied out.
function exportProfileView() {
  const p = state.profile || {};
  const inc = exportState.include;
  return {
    ...p,
    education: inc.education ? p.education : [],
    publications: inc.publications ? p.publications : [],
    certifications: inc.certifications ? p.certifications : [],
  };
}

// Selection is authoritative in this flow, so per-section caps are off; only the
// section order is passed through.
function exportLimits() {
  return { expEntries: 0, expBullets: 0, projEntries: 0, projBullets: 0,
           order: exportState.order };
}

function renderExportPreview() {
  const pane = document.getElementById('export-preview-pane');
  const page = pane?.querySelector('.rp-page');
  if (!page) return;
  page.innerHTML = renderResumeHTML(buildExportDraft(), exportProfileView(), exportLimits());
  renderPageFitBadge(pane);
  scaleResumePage(pane);
  renderExportBudget();
}

// Live budget line: how full the page is, and how many bullets are selected.
function renderExportBudget() {
  const el = document.getElementById('export-budget');
  const pane = document.getElementById('export-preview-pane');
  if (!el || !pane) return;
  const fit = measurePageFit(pane);
  if (!fit) return;
  const total = Object.values(exportState.bullets)
    .reduce((n, set) => n + (set ? set.size : 0), 0);
  el.className = `export-budget ${fit.fits ? 'is-fit' : 'is-over'}`;
  el.innerHTML = fit.fits
    ? `<strong>${fit.pct}%</strong> of one page used · ${total} bullet${total === 1 ? '' : 's'} selected`
    : `<strong>Over one page</strong> by ${Math.round(((fit.height - fit.limit) / fit.limit) * 100)}% · remove a bullet or an entry`;
}

// Same flow for both entry points. With a jobId it is "tailor for this role":
// rewrites get the job description as steering context and the filename carries
// the company. Without one it is the generic profile resume.
// The flow is one component with two mount points: the Profile page's Export
// Resume subview, and the Resume tab inside a job. Same markup, same handlers —
// the only difference is whether a jobId is attached, which switches on the
// job-skills block and gives rewrites the job description as context.
const EXPORT_MOUNTS = ['#profile-export-mount', '#job-resume-mount'];

const EXPORT_FLOW_HTML = `
  <div class="export-layout">
    <div class="export-pick-pane" id="export-pick-pane"></div>
    <div class="export-preview-pane" id="export-preview-pane">
      <div class="rp-toolbar">
        <div class="rp-toolbar-copy">
          <span class="rp-toolbar-label">Preview</span>
          <span class="rp-fit-badge"></span>
        </div>
        <button id="btn-export-profile-pdf" class="ps-save-btn rp-export-btn">
          <sl-icon library="lucide" name="download" style="vertical-align:-2px"></sl-icon>
          Export PDF
        </button>
      </div>
      <div class="rp-viewport">
        <div class="rp-scale-wrap"><div class="rp-page"></div></div>
      </div>
    </div>
  </div>`;

// Only one mount is ever populated, so the component's internal IDs stay unique
// and every handler below can keep using getElementById.
function mountExportFlow(rootSel, { jobId = null } = {}) {
  for (const sel of EXPORT_MOUNTS) {
    const el = document.querySelector(sel);
    if (el && sel !== rootSel) el.innerHTML = '';
  }
  const root = document.querySelector(rootSel);
  if (!root) return false;
  root.innerHTML = EXPORT_FLOW_HTML;
  initExportState();
  exportState.jobId = jobId || null;
  if (jobId) seedExportFromJob(jobId);
  renderExportPicker();
  renderExportPreview();
  return true;
}

// Carry over anything already decided for this job: extra skills the user had
// picked, and any bullet rewrites saved on the job record.
function seedExportFromJob(jobId) {
  const job = jobById(jobId);
  if (!job) return;
  exportState.extraSkills = new Set(job.resume_extra_skills || []);
}

// Re-render the flow in place when the underlying analysis/profile changed,
// without re-mounting (which would reset the user's selections).
function refreshMountedExportFlow() {
  if (!document.getElementById('export-pick-pane')) return;
  renderExportPicker();
  renderExportPreview();
}

// Mount inside a job's Resume tab.
function showJobResumeFlow(job) {
  if (!job) return;
  if (!state.profile || !hasProfileData(state.profile)) {
    const root = document.querySelector('#job-resume-mount');
    if (root) root.innerHTML = `<div class="empty" style="padding:48px 12px">
      <sl-icon library="lucide" name="user-round" class="empty-icon"></sl-icon>
      <div class="empty-title">No profile yet</div>
      <div class="empty-sub">Add your profile first - a resume is built from it.</div>
    </div>`;
    return;
  }
  mountExportFlow('#job-resume-mount', { jobId: job.id });
}

function showProfileExport(jobId = null) {
  if (!state.profile || !hasProfileData(state.profile)) {
    showToast('Add some profile info first.');
    return;
  }
  renderExportHeader();
  switchView('profile');
  showProfileSubview('export');
  mountExportFlow('#profile-export-mount', { jobId: jobId || null });
}

function renderExportHeader() {
  const el = document.getElementById('export-header-copy');
  const back = document.getElementById('btn-back-from-export');
  if (!el) return;
  const job = exportState.jobId ? jobById(exportState.jobId) : null;
  if (job) {
    el.innerHTML = `<h1>Tailor Resume</h1>
      <p class="view-sub">For ${escHtml([job.title, job.company].filter(Boolean).join(' at ') || 'this role')} - rewrites will lean toward what this job asks for.</p>`;
    if (back) back.innerHTML = '<sl-icon library="lucide" name="arrow-left"></sl-icon> Job';
  } else {
    el.innerHTML = `<h1>Export Resume</h1>
      <p class="view-sub">Pick what goes on the page. Not tied to any job.</p>`;
    if (back) back.innerHTML = '<sl-icon library="lucide" name="arrow-left"></sl-icon> Profile';
  }
}

// Back out to wherever the flow was opened from.
function leaveExportFlow() {
  const jobId = exportState.jobId;
  exportState.jobId = null;
  // Drop the full-width opt-in regardless of where we're heading, or the
  // profile page renders wide the next time it's opened.
  document.getElementById('view-profile')?.classList.remove('view-wide');
  if (jobId) {
    switchView('jobs');
    setTimeout(() => { showJobDetail(jobId); showJobsSubview('detail'); switchDetailTab('resume'); }, 60);
  } else {
    showProfileSubview('main');
  }
}

function renderExportPicker() {
  const el = document.getElementById('export-pick-pane');
  if (!el) return;
  const p = state.profile || {};

  // Sections listed in their print order, each row toggleable and movable, so
  // the order on screen is the order on the page.
  const labelOf = k => (EXPORT_SECTIONS.find(s => s.key === k) || {}).label || k;
  const order = exportState.order.length ? exportState.order : RESUME_SECTION_ORDER;
  const sectionToggles = order.map((key, i) => {
    const on = !!exportState.include[key];
    return `<div class="export-section-row ${on ? 'is-on' : ''}">
      <label class="export-section-main">
        <input type="checkbox" data-export-section="${escAttr(key)}"${on ? ' checked' : ''}>
        <span class="export-section-label">${escHtml(labelOf(key))}</span>
      </label>
      <div class="export-section-move">
        <button type="button" class="export-move-btn" data-export-move="up:${escAttr(key)}"
          ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button type="button" class="export-move-btn" data-export-move="down:${escAttr(key)}"
          ${i === order.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
      </div>
    </div>`;
  }).join('');

  // The summary is prose rather than bullets, so it gets its own rewrite control.
  const profileSummary = exportState.summaryText != null
    ? exportState.summaryText
    : ((p.identity || {}).summary || '');
  const summaryRewritten = exportState.summaryText != null;
  const summaryBlock = exportState.include.summary && profileSummary ? `
    <section class="export-block">
      <div class="export-block-title">Profile summary</div>
      <div class="export-summary">
        <div class="export-summary-text">${escHtml(profileSummary)}<span class="export-bullet-words">${bulletWords(profileSummary)}w</span>${summaryRewritten ? '<span class="export-rewritten">rewritten</span>' : ''}</div>
        ${(() => { const u = summaryRewritten ? unsupportedClaims(profileSummary) : [];
          return u.length ? `<div class="export-claim-warn">Not found anywhere in your profile: <strong>${u.map(escHtml).join(', ')}</strong>. Reject this unless you can back it up.</div>` : ''; })()}
        <div class="export-summary-actions">
          <button type="button" class="ps-btn-ghost export-dest-btn" data-export-guide="summary::0">Rewrite</button>
          ${summaryRewritten ? `<button type="button" class="ps-btn-ghost export-dest-btn" data-export-summary-reset="1">Restore original</button>` : ''}
        </div>
        ${exportState.guiding === 'summary::0' ? `
          <div class="export-guide-box">
            <input class="field-input export-guide-input" placeholder="What should the summary lead with?" />
            <div class="export-guide-actions">
              <button type="button" class="ai-apply-btn" data-export-guide-run="summary::0">Rewrite</button>
              <button type="button" class="ps-btn-ghost" data-export-guide-cancel="1">Cancel</button>
            </div>
            <div class="export-guide-status gen-status hidden"></div>
          </div>` : ''}
      </div>
    </section>` : '';

  const entryBlock = (kind, items, nameOf) => items.map((item, entryIdx) => {
    const k = entryKey(kind, item.id);
    const on = !!exportState.entries[k];
    const picked = exportState.bullets[k] || new Set();
    const refs = allBulletRefs(kind, item.id, item);
    const order = bulletOrderFor(k, refs);
    const rows = order.map((ref, rowIdx) => {
      const isCustom = typeof ref === 'string';
      const text = bulletRefText(kind, item.id, ref, item);
      const logK = `${kind}:${item.id}:${ref}`;
      const isRewritten = !isCustom && exportState.rewritten[logK] != null;
      const changeCount = !isCustom ? (exportState.rewriteLog[logK]?.count || 0) : 0;
      const sel = picked.has(ref);
      const gKey = logK;
      const tooLong = bulletWords(text) > BULLET_WORD_LIMIT;
      return `<div class="export-bullet ${sel ? 'is-on' : ''} ${tooLong ? 'is-overlong' : ''} ${isCustom ? 'is-custom' : ''}">
        <div class="export-bullet-move">
          <button type="button" class="export-move-btn" data-export-bullet-move="up:${escAttr(kind)}:${escAttr(String(item.id))}:${escAttr(String(ref))}"
            ${rowIdx === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button type="button" class="export-move-btn" data-export-bullet-move="down:${escAttr(kind)}:${escAttr(String(item.id))}:${escAttr(String(ref))}"
            ${rowIdx === order.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
        </div>
        <label class="export-bullet-main">
          <input type="checkbox" data-export-bullet="${escAttr(gKey)}"${sel ? ' checked' : ''}>
          ${isCustom
            ? `<input class="field-input export-bullet-input" data-export-custom-bullet="${escAttr(gKey)}" value="${escAttr(text)}" placeholder="Type a new bullet…">`
            : `<span class="export-bullet-text">${escHtml(text)}<span class="export-bullet-words${tooLong ? ' is-over' : ''}" title="${tooLong ? `Over ${BULLET_WORD_LIMIT} words - long bullets are what push the resume onto a second page` : ''}">${bulletWords(text)}w</span>${isRewritten ? `<span class="export-rewritten" title="Original: ${escAttr(exportState.rewriteLog[logK]?.original || '')}">rewritten${changeCount > 1 ? ` ${changeCount}x` : ''}</span>` : ''}</span>`}
        </label>
        ${isCustom
          ? `<button type="button" class="ps-btn-icon" data-export-remove-bullet="${escAttr(gKey)}" title="Remove this bullet">×</button>`
          : `<button type="button" class="export-guide-btn ps-btn-ghost" data-export-guide="${escAttr(gKey)}" title="Rewrite this bullet with a nudge - stays grounded in your saved notes">Rewrite</button>`}
      </div>
      ${!isCustom && isRewritten && unsupportedClaims(text).length ? `
        <div class="export-claim-warn">Not found anywhere in your profile: <strong>${unsupportedClaims(text).map(escHtml).join(', ')}</strong>. Reject this unless you can back it up.</div>` : ''}
      ${!isCustom && exportState.guiding === gKey ? `
        <div class="export-guide-box">
          <input class="field-input export-guide-input" placeholder="What should it emphasise? e.g. lead with the scale, or name the outcome" />
          <div class="export-guide-actions">
            <button type="button" class="ai-apply-btn" data-export-guide-run="${escAttr(gKey)}">Rewrite</button>
            <button type="button" class="ps-btn-ghost" data-export-guide-cancel="1">Cancel</button>
            ${isRewritten ? `<button type="button" class="ps-btn-ghost" data-export-guide-reset="${escAttr(gKey)}">Restore original</button>` : ''}
          </div>
          <div class="export-guide-status gen-status hidden"></div>
        </div>` : ''}`;
    }).join('');

    return `<div class="export-entry ${on ? '' : 'is-off'}">
      <div class="export-entry-head-row">
        <label class="export-entry-head">
          <input type="checkbox" data-export-entry="${escAttr(k)}"${on ? ' checked' : ''}>
          <span class="export-entry-name">${escHtml(nameOf(item))}</span>
          <span class="export-entry-count">${picked.size}/${refs.length}</span>
        </label>
        <div class="export-entry-move">
          <button type="button" class="export-move-btn" data-export-entry-move="up:${escAttr(kind)}:${escAttr(String(item.id))}"
            ${entryIdx === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button type="button" class="export-move-btn" data-export-entry-move="down:${escAttr(kind)}:${escAttr(String(item.id))}"
            ${entryIdx === items.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
        </div>
      </div>
      ${on && refs.length ? `<div class="export-bullets">${rows}</div>` : ''}
      ${on && !refs.length ? `<div class="export-entry-empty">No bullets yet - add one below, or add some in the profile first.</div>` : ''}
      ${on ? `<button type="button" class="ps-btn-ghost export-add-bullet-btn" data-export-add-bullet="${escAttr(k)}">+ Add bullet</button>` : ''}
    </div>`;
  }).join('');

  // Skills this job asks for that aren't in the profile. Toggling one adds it to
  // this resume only - the profile is never touched from here.
  let jobSkillsBlock = '';
  if (exportState.jobId && exportState.include.skills) {
    const job = jobById(exportState.jobId);
    const workspace = job ? buildResumeSkillWorkspace(job) : null;
    const cands = workspace ? [...workspace.all] : [];
    // Anything already selected must stay visible even if it is no longer a
    // current candidate (e.g. picked during an earlier analysis) - otherwise it
    // sits on the resume with no way to see or remove it.
    const known = new Set(cands.map(c => c.skill));
    for (const s of exportState.extraSkills) {
      if (!known.has(s)) cands.push({ skill: s, tone: 'inferred', reason: 'Added earlier for this job' });
    }
    if (cands.length) {
      const badges = cands.map(item => {
        const on = exportState.extraSkills.has(item.skill);
        return `<button type="button" class="export-skill-badge tone-${escAttr(item.tone)} ${on ? 'is-on' : ''}"
          data-export-skill="${escAttr(item.skill)}" title="${escAttr(item.reason || '')}">
          ${on ? '✓ ' : '+ '}${escHtml(item.skill)}
        </button>`;
      }).join('');
      jobSkillsBlock = `
        <section class="export-block">
          <div class="export-block-title">Skills this job asks for</div>
          <div class="export-block-note">Not in your profile. Adding one puts it on this resume only.</div>
          <div class="export-skill-badges">${badges}</div>
        </section>`;
    }
  }

  el.innerHTML = `
    <div id="export-budget" class="export-budget"></div>
    <div id="export-dest" class="export-dest"></div>

    ${jobSkillsBlock}

    <section class="export-block">
      <div class="export-block-title">Sections &amp; order</div>
      <div class="export-sections">${sectionToggles}</div>
    </section>

    ${summaryBlock}

    ${exportState.include.experience ? `
      <section class="export-block">
        <div class="export-block-title">Experience</div>
        ${entryBlock('exp', orderedItems('exp', p.experience || []), e => [e.title, e.company].filter(Boolean).join(' · ') || 'Untitled role')}
      </section>` : ''}

    ${exportState.include.projects ? `
      <section class="export-block">
        <div class="export-block-title">Projects</div>
        ${entryBlock('proj', orderedItems('proj', p.projects || []), pr => pr.name || 'Untitled project')}
      </section>` : ''}
  `;
  renderExportBudget();
  renderExportDestination();
}

// ── Unsupported-claim guard ──────────────────────────────────────────────────
// When a rewrite is given the job description as steering context, the model can
// lift a technology out of the JD and state it as the candidate's own - observed
// in practice: a summary tailored to a role that listed CrewAI came back claiming
// CrewAI, which appeared nowhere in the profile. Telling the prompt not to do
// that is not sufficient, so every rewrite is checked against the profile and
// anything unsupported is surfaced for the user to reject.
const CLAIM_STOPWORDS = new Set([
  'a','an','and','the','with','for','from','into','across','using','built','build',
  'designed','design','ships','shipped','led','cut','reduced','engineered','created',
  'implemented','developed','automated','migrated','rewrote','validated','handled',
  'ensured','experienced','focused','applied','strong','end','hands','production',
  'grade','through','over','under','while','their','this','that','these','those',
  'was','were','has','have','had','been','also','then','than','when','where','which',
  'who','why','how','all','any','both','each','more','most','other','some','such',
  'only','own','same','very','can','will','just','she','he','they','it','its','of',
  'in','on','at','to','by','as','is','are','be','or','but','if','so','no','not',
  'ambiguous','requirements','deployment','operational','ownership','systems',
  'system','platforms','platform','workflows','workflow','architectures',
  'architecture','engineer','experience','databases','database','vector','prompt',
  'engineering','deliver','delivered','scale','scalable','real','time','data',
]);

function unsupportedClaims(text) {
  const p = state.profile || {};
  const haystack = JSON.stringify(p).toLowerCase();
  const tokens = String(text || '').match(/[A-Za-z][A-Za-z0-9.+#/-]{1,}/g) || [];
  const out = [];
  const seen = new Set();
  for (const raw of tokens) {
    const t = raw.replace(/[.,;:]$/, '');
    if (t.length < 3) continue;
    const lower = t.toLowerCase();
    if (CLAIM_STOPWORDS.has(lower) || seen.has(lower)) continue;
    // Only judge things that look like a named technology or product: an
    // internal capital (LangChain, PyTorch, PGVector) or all-caps (RAG, AWS).
    const looksNamed = /[A-Z]/.test(t.slice(1)) || (t === t.toUpperCase() && t.length >= 2);
    if (!looksNamed) continue;
    seen.add(lower);
    if (!haystack.includes(lower)) out.push(t);
  }
  return out;
}

// Job context for rewrites, when this export is tailored to a specific role.
// Deliberately just the title/company and the JD text — the rewrite still may
// only state facts from the candidate's own notes; the role only steers emphasis.
function exportJobContext() {
  if (!exportState.jobId) return '';
  const job = jobById(exportState.jobId);
  if (!job) return '';
  return `THIS RESUME IS BEING TAILORED FOR THIS ROLE:\n` +
    `${[job.title, job.company].filter(Boolean).join(' at ')}\n` +
    `${truncateText(job.description || '', 1800)}\n\n` +
    `Favour the emphasis this role would care about, but do NOT claim anything ` +
    `the candidate's notes do not support just because the role asks for it.\n\n`;
}

async function runGuidedRewrite(gKey) {
  const [kind, id, idxStr] = gKey.split(':');
  const idx = Number(idxStr);
  const p = state.profile || {};

  const box = document.querySelector(`[data-export-guide-run="${gKey}"]`)?.closest('.export-guide-box');
  const guidance = box?.querySelector('.export-guide-input')?.value.trim() || '';
  const status = box?.querySelector('.export-guide-status');
  const runBtn = box?.querySelector(`[data-export-guide-run]`);

  // The summary is prose, not a bullet, so it takes a separate path.
  if (kind === 'summary') {
    if (runBtn) runBtn.disabled = true;
    if (status) { status.textContent = 'Rewriting…'; status.classList.remove('hidden'); }
    const current = exportState.summaryText != null
      ? exportState.summaryText
      : ((p.identity || {}).summary || '');
    const prompt =
      exportJobContext() +
      `THE ONLY FACTS YOU MAY USE - the candidate's profile:\n` +
      `Headline: ${(p.identity || {}).headline || ''}\n` +
      `Skills: ${(p.skill_buckets || []).flatMap(b => b.skills || []).join(', ')}\n` +
      `Roles: ${(p.experience || []).map(e => `${e.title || ''} at ${e.company || ''}`).join('; ')}\n` +
      `Projects: ${(p.projects || []).map(pr => pr.name).filter(Boolean).join('; ')}\n\n` +
      `CURRENT SUMMARY:\n${current}\n\n` +
      (guidance ? `WHAT THE CANDIDATE WANTS IT TO LEAD WITH:\n${guidance}\n\n` : '') +
      `Rewrite the professional summary as 2 to 3 sentences of prose, max 60 words ` +
      `total. Return it as the single item in "highlights" - it is prose, so the ` +
      `bullet rules about action verbs do NOT apply here. Leave "description", ` +
      `"tech" and "tags" empty. Invent nothing.`;
    try {
      const result = await runAgentToFile('profile-writer', prompt);
      const fresh = (result.highlights || []).filter(Boolean)[0];
      if (!fresh) throw new Error('nothing returned');
      exportState.summaryText = fresh;
      exportState.guiding = null;
      renderExportPicker(); renderExportPreview();
      showToast('Summary rewritten.');
    } catch (e) {
      if (status) status.textContent = `Rewrite failed: ${e.message}`;
      if (runBtn) runBtn.disabled = false;
    }
    return;
  }

  const list = kind === 'exp' ? (p.experience || []) : (p.projects || []);
  const item = list.find(x => String(x.id) === String(id));
  if (!item) return;

  if (runBtn) runBtn.disabled = true;
  if (status) { status.textContent = 'Rewriting…'; status.classList.remove('hidden'); }

  const current = exportBulletText(kind, id, idx, (item.highlights || [])[idx]);
  const context = kind === 'exp'
    ? `ROLE: ${item.title || ''} at ${item.company || ''}`
    : `PROJECT: ${item.name || ''}`;

  const entryK = entryKey(kind, id);
  const selected = exportState.bullets[entryK] || new Set();
  const logKey = `${kind}:${id}:${idx}`;
  const log = exportState.rewriteLog[logKey];

  // Every sibling bullet, labelled with whether it will actually appear on the
  // page. Included ones are territory to avoid; excluded ones are content the
  // candidate dropped, so their substance is fair to absorb here.
  const siblings = (item.highlights || []).map((h, i) => {
    if (i === idx) return null;
    const text = exportBulletText(kind, id, i, h);
    const mark = selected.has(i) ? 'ON THE PAGE' : 'NOT ON THE PAGE';
    return `- [${mark}] ${text}`;
  }).filter(Boolean).join('\n') || '(this entry has no other bullets)';

  const historyBlock = log
    ? `THIS BULLET HAS ALREADY BEEN REWRITTEN ${log.count} time${log.count === 1 ? '' : 's'}.\n` +
      `Originally it said:\n  ${log.original}\n` +
      (log.versions.length > 1
        ? `Earlier rewrite attempts (do not simply return one of these again):\n${log.versions.slice(0, -1).map(v => `  - ${v}`).join('\n')}\n`
        : '')
    : '';

  const prompt =
    exportJobContext() +
    `${context}\n\n` +
    `THE ONLY FACTS YOU MAY USE - the candidate's own saved notes for this entry:\n` +
    `${item.raw_description || '(none provided)'}\n\n` +
    `ALL OTHER BULLETS ON THIS ENTRY, and whether each will appear on the resume:\n` +
    `${siblings}\n\n` +
    `Rules about those:\n` +
    `- Do NOT repeat or paraphrase the angle of any bullet marked ON THE PAGE. ` +
    `The rewritten bullet has to earn its own space next to them.\n` +
    `- Bullets marked NOT ON THE PAGE were deliberately dropped. If something in ` +
    `them is worth saving and it fits what is being asked for here, you may fold ` +
    `that substance into this bullet.\n\n` +
    historyBlock + '\n' +
    `CURRENT TEXT OF THE BULLET YOU ARE REWRITING:\n${current}\n\n` +
    (guidance ? `WHAT THE CANDIDATE WANTS IT TO EMPHASISE:\n${guidance}\n\n` : '') +
    `Rewrite this ONE bullet. Return it as the single item in "highlights". ` +
    `Leave "description", "tech" and "tags" empty. ` +
    `Every claim must be supported by the notes above - if the requested emphasis ` +
    `is not supported by them, write the closest thing that IS supported rather ` +
    `than inventing it.`;

  try {
    const result = await runAgentToFile('profile-writer', prompt);
    const fresh = (result.highlights || []).filter(Boolean)[0];
    if (!fresh) throw new Error('nothing returned');
    // Record before overwriting so "original" survives repeated rewrites.
    const entry = exportState.rewriteLog[logKey] || {
      original: (item.highlights || [])[idx] || '',
      versions: [],
      count: 0,
    };
    entry.versions.push(fresh);
    entry.count += 1;
    exportState.rewriteLog[logKey] = entry;
    exportState.rewritten[logKey] = fresh;
    // Selecting it is the obvious intent after a rewrite.
    const k = entryKey(kind, id);
    (exportState.bullets[k] = exportState.bullets[k] || new Set()).add(idx);
    exportState.guiding = null;
    renderExportPicker();
    renderExportPreview();
    showToast('Bullet rewritten.');
  } catch (e) {
    if (status) status.textContent = `Rewrite failed: ${e.message}`;
    if (runBtn) runBtn.disabled = false;
  }
}

// Remembered between sessions so repeat exports don't re-ask. Empty = Downloads.
const EXPORT_DIR_KEY = 'export-dir';
function savedExportDir() { try { return localStorage.getItem(EXPORT_DIR_KEY) || ''; } catch (_) { return ''; } }
function setSavedExportDir(dir) { try { localStorage.setItem(EXPORT_DIR_KEY, dir || ''); } catch (_) {} }

function renderExportDestination() {
  const el = document.getElementById('export-dest');
  if (!el) return;
  const dir = savedExportDir();
  el.innerHTML = `
    <span class="export-dest-label">Save to</span>
    <span class="export-dest-path" title="${escAttr(dir || 'Your Downloads folder')}">${escHtml(dir || 'Downloads')}</span>
    <button type="button" class="ps-btn-ghost export-dest-btn" id="btn-choose-export-dir">Change…</button>
    ${dir ? `<button type="button" class="ps-btn-ghost export-dest-btn" id="btn-clear-export-dir" title="Go back to the Downloads folder">Reset</button>` : ''}`;
}

async function chooseExportDir() {
  try {
    const dir = await bridge.openFolderDialog();
    // The bridge returns a path string on success, but surfaces failures as an
    // {ok:false,error} object — storing that as a path would silently break
    // every later export.
    if (typeof dir !== 'string') {
      showToast(`Could not open the folder picker: ${dir?.error || 'unavailable'}`);
      return;
    }
    if (!dir) return;   // user cancelled
    setSavedExportDir(dir);
    renderExportDestination();
    showToast('Export folder set.');
  } catch (e) {
    showToast(`Could not open the folder picker: ${e.message}`);
  }
}

async function exportProfileResumePDF() {
  const pane = document.getElementById('export-preview-pane');
  const page = pane?.querySelector('.rp-page');
  if (!page) return;
  const fit = measurePageFit(pane);
  if (fit && !fit.fits &&
      !confirm(`This is ${Math.round(((fit.height - fit.limit) / fit.limit) * 100)}% over one page and will spill onto a second page.\n\nExport anyway?`)) {
    return;
  }
  const btn = document.getElementById('btn-export-profile-pdf');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<sl-spinner style="font-size:13px;--track-width:2px"></sl-spinner> Exporting…'; }
  try {
    const name = ((state.profile || {}).identity || {}).name || 'resume';
    const slug = t => (t || '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
    const job = exportState.jobId ? jobById(exportState.jobId) : null;
    const filename = job
      ? `${slug(name)}_${slug(job.company) || 'Role'}_Resume.pdf`
      : `${slug(name)}_Resume.pdf`;
    const html = buildExportHTML(buildExportDraft(), exportProfileView(), exportLimits());
    const res = await bridge.exportResumePdf(html, filename, savedExportDir());
    if (res?.ok) {
      showToast(`Saved: ${res.path || res.filename}`);
      // The rewrite ledger is scratch context for one export session only.
      exportState.rewriteLog = {};
    } else {
      showToast(`Export failed: ${res?.error || 'unknown error'}`);
    }
  } catch (e) {
    showToast(`Export failed: ${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

// ── Profile strength ─────────────────────────────────────────────────────────
// Turns "is my profile any good?" into a list of specific things to go fix.
// Score and gap list come from ONE check list on purpose — otherwise the number
// and the advice can contradict each other (100% while listing gaps).
// Weight reflects how much a recruiter actually reads that part.
function profileChecks(p) {
  const id = p.identity || {};
  const contact = p.contact || {};
  const exps = p.experience || [];
  const projs = p.projects || [];

  const thinExp = exps.filter(e => !(e.highlights || []).length);
  const thinProj = projs.filter(pr => !(pr.highlights || []).length);
  const noMetric = [...exps, ...projs].filter(item =>
    (item.highlights || []).length && !(item.highlights || []).some(h => /\d/.test(h)));

  return [
    { ok: !!id.name, weight: 10, section: 'identity', text: 'No name set' },
    { ok: !!id.headline, weight: 10, section: 'identity', text: 'No headline set' },
    { ok: !!id.summary, weight: 10, section: 'identity', text: 'No summary written' },
    { ok: !!id.location, weight: 3, section: 'identity', text: 'No location set' },
    { ok: !!contact.email, weight: 5, section: 'contact', text: 'No email address' },
    { ok: !!(contact.links || []).length, weight: 4, section: 'contact', text: 'No links (GitHub, LinkedIn)' },
    { ok: !!(p.skill_buckets || []).length, weight: 10, section: 'skills', text: 'No skills listed' },
    { ok: exps.length > 0, weight: 15, section: 'experience', text: 'No roles added' },
    {
      ok: !thinExp.length, weight: 10, section: 'experience',
      text: `${thinExp.length} role${thinExp.length === 1 ? ' has' : 's have'} no bullets`,
      hint: thinExp.map(e => e.title || 'Untitled').join(', '),
    },
    { ok: projs.length > 0, weight: 10, section: 'projects', text: 'No projects added' },
    {
      ok: !thinProj.length, weight: 8, section: 'projects',
      text: `${thinProj.length} project${thinProj.length === 1 ? ' has' : 's have'} no bullets`,
      hint: thinProj.map(pr => pr.name || 'Untitled').join(', '),
    },
    {
      ok: !noMetric.length, weight: 10, section: 'experience',
      text: `${noMetric.length} entr${noMetric.length === 1 ? 'y has' : 'ies have'} no numbers`,
      hint: 'Bullets with concrete results screen better',
    },
    { ok: !!(p.education || []).length, weight: 5, section: 'education', text: 'No education added' },
  ];
}

function renderProfileStrength(p) {
  const checks = profileChecks(p);
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const score = Math.round((got / total) * 100);
  // Heaviest unmet checks first — fixing the top item moves the number most.
  const gaps = checks.filter(c => !c.ok).sort((a, b) => b.weight - a.weight);
  const tone = score >= 85 ? 'strong' : score >= 60 ? 'ok' : 'weak';
  const gapHtml = gaps.length
    ? `<div class="pstrength-gaps">${gaps.slice(0, 6).map(g => `
        <button class="pstrength-gap" data-jump-section="${escAttr(g.section)}" title="Go to ${escAttr(g.section)}">
          <span class="pstrength-gap-text">${escHtml(g.text)}</span>
          ${g.hint ? `<span class="pstrength-gap-hint">${escHtml(g.hint)}</span>` : ''}
        </button>`).join('')}
        ${gaps.length > 6 ? `<span class="pstrength-more">+${gaps.length - 6} more</span>` : ''}
      </div>`
    : `<div class="pstrength-clear">Nothing missing - your profile is complete.</div>`;

  return `<div class="pstrength pstrength-${tone}">
    <div class="pstrength-head">
      <div class="pstrength-score">
        <span class="pstrength-num">${score}<span class="pstrength-pct">%</span></span>
        <span class="pstrength-label">Profile strength</span>
      </div>
      <div class="pstrength-bar"><div class="pstrength-fill" style="width:${score}%"></div></div>
    </div>
    ${gapHtml}
  </div>`;
}

function updateSidebarPersona() {
  const profile = state.profile || {};
  const identity = profile.identity || {};
  const name = document.getElementById('sidebar-persona-name');
  const headline = document.getElementById('sidebar-persona-headline');
  const score = document.getElementById('sidebar-persona-score');
  const fill = document.getElementById('sidebar-persona-fill');
  if (!name || !headline || !score || !fill) return;

  const checks = profileChecks(profile);
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const complete = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  const percentage = total ? Math.round((complete / total) * 100) : 0;
  name.textContent = identity.name || 'No profile yet';
  headline.textContent = identity.headline || 'Add your experience to get started';
  score.textContent = `${percentage}%`;
  fill.style.width = `${percentage}%`;
}

function renderSection(name) {
  const meta      = SECTION_META[name];
  const isEditing = state.editingSection === name;
  const body      = isEditing ? renderSectionEdit(name) : renderSectionView(name);
  const actions   = isEditing
    ? `<button class="ps-save-btn"   data-section="${name}">Save</button>
       <button class="ps-cancel-btn" data-section="${name}">Cancel</button>`
    : `<button class="ps-edit-btn"   data-section="${name}">
         <sl-icon library="lucide" name="pencil"></sl-icon>
       </button>`;
  return `<div class="profile-section" data-section="${name}">
    <div class="ps-header">
      <div class="ps-title">
        <sl-icon library="lucide" name="${meta.icon}"></sl-icon>${meta.label}
      </div>
      <div class="ps-actions">${actions}</div>
    </div>
    <div class="ps-body">${body}</div>
  </div>`;
}

function replaceSectionInDOM(name) {
  const old = document.querySelector(`.profile-section[data-section="${name}"]`);
  if (!old) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = renderSection(name);
  old.replaceWith(tmp.firstElementChild);
}

// ── Profile: view renderers (one entry per section; see SECTION_EDITS below) ───
const SECTION_VIEWS = {
  identity: (p) => {
    const id = p.identity || {};
    if (!id.name && !id.headline && !id.summary)
      return psEmpty('No identity info - click Edit to add.');
    const variants = (id.headline_variants || []).filter(v => v && v !== id.headline);
    return `
        ${id.name     ? `<div class="ps-name">${escHtml(id.name)}</div>` : ''}
        ${id.headline ? `<div class="ps-headline">${escHtml(id.headline)}</div>` : ''}
        ${variants.length ? `<div class="hv-view-row">
          <span class="hv-view-count">${variants.length} other headline${variants.length > 1 ? 's' : ''} saved</span>
          <button class="ps-btn-ghost hv-view-btn" id="btn-headline-manage">Switch</button>
        </div>` : ''}
        ${id.location ? `<div class="ps-meta-row"><sl-icon library="lucide" name="map-pin"></sl-icon>${escHtml(id.location)}</div>` : ''}
        ${id.summary  ? `<p class="ps-summary">${escHtml(id.summary)}</p>` : ''}`;
  },
  contact: (p) => {
    const c = p.contact || {};
    if (!c.email && !c.phone && !(c.links||[]).length)
      return psEmpty('No contact info - click Edit to add.');
    return `
        ${c.email ? `<div class="ps-meta-row"><sl-icon library="lucide" name="mail"></sl-icon>${escHtml(c.email)}</div>` : ''}
        ${c.phone ? `<div class="ps-meta-row"><sl-icon library="lucide" name="phone"></sl-icon>${escHtml(c.phone)}</div>` : ''}
        ${(c.links||[]).map(l => `<div class="ps-meta-row"><sl-icon library="lucide" name="link"></sl-icon>
          <a class="p-link" href="${escAttr(normalizeUrl(l.url))}" target="_blank">${escHtml(l.label || l.url)}</a></div>`).join('')}`;
  },
  skills: (p) => {
    const bs = p.skill_buckets || [];
    if (!bs.length) return psEmpty('No skills - click Edit to add buckets.');
    return bs.map(b => `
        <div class="skill-bucket-view">
          <div class="skill-bucket-label">${escHtml(b.category)}</div>
          <div class="chips">${(b.skills||[]).map(s=>`<span class="chip">${escHtml(s)}</span>`).join('')}</div>
        </div>`).join('');
  },
  experience: (p) => {
    const exps = p.experience || [];
    if (!exps.length) return psEmpty('No experience - click Edit to add.');
    return exps.map(e => `
        <div class="ps-list-item">
          <div class="entry-head">
            <span class="entry-title">${escHtml(e.title||'')}</span>
            <span class="entry-dates">${escHtml([e.start,e.end].filter(Boolean).join(' – '))}</span>
          </div>
          <div class="entry-sub">${escHtml(e.company||'')}</div>
          ${e.raw_description ? `<p class="ps-raw-desc">${escHtml(e.raw_description)}</p>` : ''}
          ${(e.highlights||[]).length ? `<ul class="ps-bullets">${e.highlights.map(h=>`<li>${escHtml(h)}</li>`).join('')}</ul>` : ''}
          ${(e.tags||[]).length ? `<div class="chips" style="margin-top:7px">${e.tags.map(t=>`<span class="chip chip-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
        </div>`).join('');
  },
  projects: (p) => {
    const projs = p.projects || [];
    if (!projs.length) return psEmpty('No projects - click Edit to add.');
    return projs.map(pr => `
        <div class="ps-list-item">
          <div class="ps-proj-head">
            <span class="entry-title">${escHtml(pr.name||'')}</span>
            ${pr.url ? `<a class="p-link" href="${escAttr(normalizeUrl(pr.url))}" target="_blank" style="font-size:13px">
              <sl-icon library="lucide" name="external-link"></sl-icon></a>` : ''}
          </div>
          ${pr.description ? `<div class="entry-sub">${escHtml(pr.description)}</div>` : ''}
          ${pr.raw_description ? `<p class="ps-raw-desc">${escHtml(pr.raw_description)}</p>` : ''}
          ${(pr.tech||[]).length ? `<div class="chips" style="margin-top:7px">${pr.tech.map(t=>`<span class="chip">${escHtml(t)}</span>`).join('')}</div>` : ''}
          ${(pr.highlights||[]).length ? `<ul class="ps-bullets">${pr.highlights.map(h=>`<li>${escHtml(h)}</li>`).join('')}</ul>` : ''}
          ${(pr.tags||[]).length ? `<div class="chips" style="margin-top:7px">${pr.tags.map(t=>`<span class="chip chip-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
        </div>`).join('');
  },
  education: (p) => {
    const eds = p.education || [];
    if (!eds.length) return psEmpty('No education - click Edit to add.');
    return eds.map(ed => `
        <div class="ps-list-item">
          <div class="entry-title">${escHtml(ed.degree||'')}</div>
          <div class="entry-sub">${escHtml([ed.institution, ed.year, ed.cgpa ? `CGPA: ${ed.cgpa}` : ''].filter(Boolean).join(' · '))}</div>
        </div>`).join('');
  },
  certifications: (p) => {
    const certs = p.certifications || [];
    if (!certs.length) return psEmpty('No certifications - click Edit to add.');
    return certs.map(c => {
      const obj = typeof c === 'string' ? { name: c, issuer: '', year: '' } : c;
      return `<div class="ps-list-item">
          <div class="entry-title">${escHtml(obj.name||'')}</div>
          ${(obj.issuer||obj.year) ? `<div class="entry-sub">${escHtml([obj.issuer,obj.year].filter(Boolean).join(' · '))}</div>` : ''}
        </div>`;}).join('');
  },
  publications: (p) => {
    const pubs = p.publications || [];
    if (!pubs.length) return psEmpty('No publications - click Edit to add.');
    return pubs.map(pub => `
        <div class="ps-list-item">
          <div class="entry-title">${escHtml(pub.title||'')}</div>
          <div class="entry-sub">${escHtml([pub.venue,pub.year].filter(Boolean).join(' · '))}</div>
          ${pub.url ? `<a class="p-link" href="${escAttr(normalizeUrl(pub.url))}" target="_blank" style="font-size:12.5px">${escHtml(pub.url)}</a>` : ''}
        </div>`).join('');
  },
};

function renderSectionView(name) {
  const fn = SECTION_VIEWS[name];
  return fn ? fn(state.profile) : '';
}

function psEmpty(msg) {
  return `<div class="ps-empty-msg">${escHtml(msg)}</div>`;
}

// ── Profile: edit renderers (one entry per section; mirrors SECTION_VIEWS) ─────
const SECTION_EDITS = {
  identity: (p) => {
    const id = p.identity || {};
    const variants = id.headline_variants || [];
    return `
        <div class="form-field"><label class="field-label">Name</label>
          <input class="field-input" data-field="name" value="${escAttr(id.name||'')}"/></div>
        <div class="form-field">
          <label class="field-label">Headline</label>
          <input class="field-input" data-field="headline" id="headline-active-input" value="${escAttr(id.headline||'')}"/>
          <div class="hv-toolbar">
            <button class="ps-btn-ghost" id="btn-headline-generate" title="Suggest headline options based on your experience and skills (uses AI)">
              <sl-icon library="lucide" name="sparkles"></sl-icon> Suggest headlines
            </button>
            <button class="ps-btn-ghost" id="btn-headline-save-current" title="Keep the current headline in your saved list so you can switch back to it">Save this one</button>
          </div>
          <div id="headline-variants-list" class="hv-list">${renderHeadlineVariants(variants, id.headline)}</div>
          <div id="headline-status" class="gen-status hidden"></div>
        </div>
        <div class="form-field"><label class="field-label">Location</label>
          <input class="field-input" data-field="location" value="${escAttr(id.location||'')}"/></div>
        <div class="form-field"><label class="field-label">Summary</label>
          <textarea class="field-input field-textarea" data-field="summary">${escHtml(id.summary||'')}</textarea></div>`;
  },
  contact: (p) => {
    const c = p.contact || {};
    const linksHtml = (c.links||[]).map(l => `
        <div class="link-entry ps-list-row">
          <input class="field-input" data-subfield="label" placeholder="Label (LinkedIn, GitHub…)" value="${escAttr(l.label||'')}"/>
          <input class="field-input" data-subfield="url" placeholder="URL" value="${escAttr(l.url||'')}"/>
          <button class="ps-remove-link ps-btn-icon" title="Remove">×</button>
        </div>`).join('');
    return `
        <div class="form-field"><label class="field-label">Email</label>
          <input class="field-input" data-field="email" value="${escAttr(c.email||'')}"/></div>
        <div class="form-field"><label class="field-label">Phone</label>
          <input class="field-input" data-field="phone" value="${escAttr(c.phone||'')}"/></div>
        <div class="form-field"><label class="field-label">Links</label>
          <div id="links-editor">${linksHtml}</div>
          <button class="ps-add-link ps-btn-ghost" style="margin-top:8px">+ Add Link</button>
        </div>`;
  },
  skills: (p) =>
    `<div id="buckets-editor">
          ${(p.skill_buckets||[]).map(renderBucketEdit).join('')}
        </div>
        <button class="ps-add-bucket ps-btn-ghost" style="margin-top:10px">+ Add Bucket</button>`,
  experience: (p) =>
    `<div id="exp-editor">
          ${(p.experience||[]).map(renderExpItemEdit).join('')}
        </div>
        <button class="ps-add-exp ps-btn-ghost" style="margin-top:10px">+ Add Role</button>`,
  projects: (p) =>
    `<div id="proj-editor">
          ${(p.projects||[]).map(renderProjItemEdit).join('')}
        </div>
        <button class="ps-add-proj ps-btn-ghost" style="margin-top:10px">+ Add Project</button>`,
  education: (p) =>
    `<div id="edu-editor">
          ${(p.education||[]).map((ed,i) => `
            <div class="ps-list-edit-row" data-idx="${i}">
              <div class="ps-list-edit-fields">
                <input class="field-input" data-subfield="degree" placeholder="Degree" value="${escAttr(ed.degree||'')}"/>
                <input class="field-input" data-subfield="institution" placeholder="Institution" value="${escAttr(ed.institution||'')}"/>
                <input class="field-input" data-subfield="year" placeholder="Year" value="${escAttr(ed.year||'')}"/>
                <input class="field-input" data-subfield="cgpa" placeholder="CGPA / GPA (optional)" value="${escAttr(ed.cgpa||'')}"/>
              </div>
              <button class="ps-remove-edu ps-btn-icon">×</button>
            </div>`).join('')}
        </div>
        <button class="ps-add-edu ps-btn-ghost" style="margin-top:10px">+ Add Education</button>`,
  certifications: (p) => {
    const certs = (p.certifications||[]).map(c => typeof c === 'string' ? {name:c,issuer:'',year:''} : c);
    return `<div id="cert-editor">
          ${certs.map((c,i) => `
            <div class="ps-list-edit-row" data-idx="${i}">
              <div class="ps-list-edit-fields">
                <input class="field-input" data-subfield="name" placeholder="Certification name" value="${escAttr(c.name||'')}"/>
                <input class="field-input" data-subfield="issuer" placeholder="Issuer" value="${escAttr(c.issuer||'')}"/>
                <input class="field-input" data-subfield="year" placeholder="Year" value="${escAttr(c.year||'')}"/>
              </div>
              <button class="ps-remove-cert ps-btn-icon">×</button>
            </div>`).join('')}
        </div>
        <button class="ps-add-cert ps-btn-ghost" style="margin-top:10px">+ Add Certification</button>`;
  },
  publications: (p) =>
    `<div id="pub-editor">
          ${(p.publications||[]).map((pub,i) => `
            <div class="ps-list-edit-row" data-idx="${i}">
              <div class="ps-list-edit-fields">
                <input class="field-input" data-subfield="title" placeholder="Title" value="${escAttr(pub.title||'')}"/>
                <input class="field-input" data-subfield="venue" placeholder="Venue / Journal" value="${escAttr(pub.venue||'')}"/>
                <input class="field-input" data-subfield="year" placeholder="Year" value="${escAttr(pub.year||'')}"/>
                <input class="field-input" data-subfield="url" placeholder="URL" value="${escAttr(pub.url||'')}"/>
              </div>
              <button class="ps-remove-pub ps-btn-icon">×</button>
            </div>`).join('')}
        </div>
        <button class="ps-add-pub ps-btn-ghost" style="margin-top:10px">+ Add Publication</button>`,
};

function renderSectionEdit(name) {
  const fn = SECTION_EDITS[name];
  return fn ? fn(state.profile) : '';
}

// ── Headline variations ──────────────────────────────────────────────────────
// One headline is active (identity.headline); the rest live in
// identity.headline_variants so you can keep angles for different role types
// and switch without rewriting.
function renderHeadlineVariants(variants, active) {
  const list = (variants || []).filter(Boolean);
  if (!list.length) return '';
  return list.map((v, i) => `
    <div class="hv-row ${v === active ? 'is-active' : ''}">
      <button class="hv-use" data-hv-use="${i}" title="${v === active ? 'Currently in use' : 'Use this headline'}">
        ${v === active ? '<sl-icon library="lucide" name="check"></sl-icon>' : ''}
      </button>
      <span class="hv-text">${escHtml(v)}</span>
      <button class="hv-remove ps-btn-icon" data-hv-remove="${i}" title="Remove">×</button>
    </div>`).join('');
}

function refreshHeadlineVariantsUI() {
  const el = document.getElementById('headline-variants-list');
  if (!el) return;
  const id = state.profile.identity || {};
  const activeInput = document.getElementById('headline-active-input');
  el.innerHTML = renderHeadlineVariants(id.headline_variants, activeInput ? activeInput.value : id.headline);
}

function saveCurrentHeadlineAsVariant() {
  const input = document.getElementById('headline-active-input');
  const value = (input?.value || '').trim();
  if (!value) { showToast('Write a headline first.'); return; }
  const id = state.profile.identity = state.profile.identity || {};
  id.headline_variants = id.headline_variants || [];
  if (id.headline_variants.includes(value)) { showToast('Already saved.'); return; }
  id.headline_variants.push(value);
  refreshHeadlineVariantsUI();
  showToast('Headline saved to your list.');
}

function useHeadlineVariant(idx) {
  const id = state.profile.identity || {};
  const value = (id.headline_variants || [])[idx];
  if (!value) return;
  const input = document.getElementById('headline-active-input');
  if (input) input.value = value;
  refreshHeadlineVariantsUI();
}

function removeHeadlineVariant(idx) {
  const id = state.profile.identity || {};
  (id.headline_variants || []).splice(idx, 1);
  refreshHeadlineVariantsUI();
}

async function generateHeadlines() {
  const btn = document.getElementById('btn-headline-generate');
  const status = document.getElementById('headline-status');
  if (btn) { btn.disabled = true; }
  if (status) {
    status.textContent = 'Writing headline options…';
    status.classList.remove('hidden');
  }
  try {
    const p = state.profile || {};
    const prompt =
      `CANDIDATE PROFILE:\n${JSON.stringify({
        identity: p.identity,
        skill_buckets: p.skill_buckets,
        experience: (p.experience || []).map(e => ({
          title: e.title, company: e.company, highlights: e.highlights,
        })),
        projects: (p.projects || []).map(pr => ({
          name: pr.name, description: pr.description, tech: pr.tech,
        })),
      }, null, 2)}\n\nGenerate headline options for this candidate.`;
    const result = await runAgentToFile('headline-writer', prompt);
    const fresh = (result?.headlines || []).filter(h => typeof h === 'string' && h.trim());
    if (!fresh.length) throw new Error('No headlines returned');
    const id = state.profile.identity = state.profile.identity || {};
    id.headline_variants = [...new Set([...(id.headline_variants || []), ...fresh])];
    refreshHeadlineVariantsUI();
    if (status) status.classList.add('hidden');
    showToast(`Added ${fresh.length} headline options - click one to use it.`);
  } catch (e) {
    if (status) status.textContent = `Could not generate headlines: ${e.message}`;
    showToast('Headline generation failed.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Write with AI ────────────────────────────────────────────────────────────
// You brain-dump into the description box in whatever words come out; this
// turns that into resume bullets. Nothing is applied until you accept it, and
// the raw text is always preserved so you can re-run with more detail later.
let _aiDraft = null;   // { kind, idx, result } awaiting accept/discard

async function writeWithAI(kind, idx) {
  const wrap = document.querySelector(`.${kind === 'experience' ? 'exp' : 'proj'}-item-edit[data-idx="${idx}"]`);
  if (!wrap) return;
  const rawEl = wrap.querySelector('[data-field="raw_description"]');
  const raw = (rawEl?.value || '').trim();
  if (raw.length < 40) {
    showToast('Write a bit more in the description first - a sentence or two at minimum.');
    return;
  }

  const btn = wrap.querySelector('.ai-write-btn');
  const panel = wrap.querySelector('.ai-draft-panel');
  if (btn) { btn.disabled = true; btn.innerHTML = '<sl-spinner style="font-size:12px"></sl-spinner> Writing…'; }
  if (panel) {
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="ai-draft-loading"><div class="app-spin"></div> Turning your notes into resume bullets…</div>`;
  }

  try {
    const context = kind === 'experience'
      ? `ROLE: ${wrap.querySelector('[data-field="title"]')?.value || ''} at ${wrap.querySelector('[data-field="company"]')?.value || ''}`
      : `PROJECT: ${wrap.querySelector('[data-field="name"]')?.value || ''}`;
    const prompt = `KIND: ${kind}\n${context}\n\nRAW NOTES FROM THE CANDIDATE:\n${raw}\n\n` +
      `Turn these notes into resume content.`;
    const result = await runAgentToFile('profile-writer', prompt);
    _aiDraft = { kind, idx, result };
    renderAIDraftPanel(wrap, kind, result);
  } catch (e) {
    if (panel) panel.innerHTML = `<div class="ai-draft-error">Couldn't write that up: ${escHtml(e.message)}</div>`;
    showToast('AI writing failed - try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<sl-icon library="lucide" name="sparkles"></sl-icon> Write with AI'; }
  }
}

// A bullet past this length reliably breaks the one-page resume, and it's the
// tell of a padded line. The model is told 25; this is the deterministic check,
// because prompt compliance varies run to run.
const BULLET_WORD_LIMIT = 25;
const bulletWords = (b) => String(b || '').trim().split(/\s+/).filter(Boolean).length;

function renderAIDraftPanel(wrap, kind, result) {
  const panel = wrap.querySelector('.ai-draft-panel');
  if (!panel) return;
  const bullets = (result.highlights || []).filter(Boolean);
  const overLong = bullets.filter(b => bulletWords(b) > BULLET_WORD_LIMIT).length;
  const tech = (result.tech || []).filter(Boolean);
  const tags = (result.tags || []).filter(Boolean);

  panel.innerHTML = `
    <div class="ai-draft-head">
      <span class="ai-draft-title"><sl-icon library="lucide" name="sparkles"></sl-icon> Suggested</span>
      <span class="ai-draft-note">Review before applying - your notes stay as they are.</span>
    </div>
    ${result.description ? `
      <div class="ai-draft-block">
        <div class="ai-draft-label">Summary line</div>
        <div class="ai-draft-value">${escHtml(result.description)}</div>
      </div>` : ''}
    ${bullets.length ? `
      <div class="ai-draft-block">
        <div class="ai-draft-label">Bullets</div>
        <ul class="ai-draft-bullets">${bullets.map(b => {
          const w = bulletWords(b);
          const over = w > BULLET_WORD_LIMIT;
          return `<li class="${over ? 'is-overlong' : ''}">${escHtml(b)}<span class="ai-bullet-words">${w}w</span></li>`;
        }).join('')}</ul>
        ${overLong ? `<div class="ai-draft-warn">
          ${overLong} bullet${overLong > 1 ? 's are' : ' is'} over ${BULLET_WORD_LIMIT} words - long bullets are what push a resume onto page 2.
          <button type="button" class="ps-btn-ghost ai-rerun-btn" data-ai-rerun="${kind}:${wrap.dataset.idx}">Try again</button>
        </div>` : ''}
      </div>` : ''}
    ${tech.length ? `
      <div class="ai-draft-block">
        <div class="ai-draft-label">Tech</div>
        <div class="chips">${tech.map(t => `<span class="chip">${escHtml(t)}</span>`).join('')}</div>
      </div>` : ''}
    ${tags.length ? `
      <div class="ai-draft-block">
        <div class="ai-draft-label">Tags</div>
        <div class="chips">${tags.map(t => `<span class="chip chip-tag">${escHtml(t)}</span>`).join('')}</div>
      </div>` : ''}
    <div class="ai-draft-actions">
      <button class="ai-apply-btn ai-draft-apply" data-ai-apply="${kind}:${wrap.dataset.idx}">Apply</button>
      <button class="ps-btn-ghost ai-draft-discard">Discard</button>
    </div>`;
}

// Writes the accepted draft into the live edit form (not straight to disk) so
// the normal Save/Cancel flow still governs whether it is persisted.
function applyAIDraft(kind, idx) {
  if (!_aiDraft || _aiDraft.kind !== kind || String(_aiDraft.idx) !== String(idx)) return;
  const wrap = document.querySelector(`.${kind === 'experience' ? 'exp' : 'proj'}-item-edit[data-idx="${idx}"]`);
  if (!wrap) return;
  const r = _aiDraft.result;

  if (kind === 'projects' && r.description) {
    const descInput = wrap.querySelector('[data-field="description"]');
    if (descInput) descInput.value = r.description;
  }

  const bullets = (r.highlights || []).filter(Boolean);
  if (bullets.length) {
    const editor = wrap.querySelector('.highlights-editor');
    if (editor) {
      editor.innerHTML = bullets.map(h =>
        `<div class="highlight-row"><input class="field-input highlight-text" value="${escAttr(h)}"/><button class="ps-remove-highlight ps-btn-icon">×</button></div>`
      ).join('');
    }
  }

  if (kind === 'projects') {
    const techWrap = wrap.querySelector('.skill-chips-edit');
    for (const t of (r.tech || []).filter(Boolean)) {
      if (techWrap && !techWrap.querySelector(`[data-skill="${CSS.escape(t)}"]`)) addSkillChip(techWrap, t);
    }
  }
  const tagWrap = wrap.querySelector('.tag-chips-edit');
  for (const t of (r.tags || []).filter(Boolean)) {
    if (tagWrap && !tagWrap.querySelector(`[data-tag="${CSS.escape(t)}"]`)) addTagChip(tagWrap, t);
  }

  wrap.querySelector('.ai-draft-panel')?.classList.add('hidden');
  _aiDraft = null;
  showToast('Applied - remember to Save the section.');
}

function renderBucketEdit(bucket, idx) {
  return `<div class="skill-bucket-edit" data-bucket-idx="${idx}">
    <div class="skill-bucket-edit-header">
      <input class="field-input bucket-name-input" value="${escAttr(bucket.category||'')}" placeholder="Bucket name (e.g. Cloud Platforms)"/>
      <button class="ps-remove-bucket ps-btn-icon" title="Remove bucket">×</button>
    </div>
    <div class="skill-chips-edit">
      ${(bucket.skills||[]).map(s => `<span class="skill-chip-tag" data-skill="${escAttr(s)}">${escHtml(s)}<button class="skill-chip-remove">×</button></span>`).join('')}
      <input class="skill-add-input" placeholder="Add skill, press Enter"/>
    </div>
  </div>`;
}

function renderExpItemEdit(exp, idx) {
  return `<div class="ps-item-edit exp-item-edit" data-idx="${idx}" data-id="${escAttr(exp.id||'')}">
    <div class="ps-item-edit-header">
      <span class="ps-item-num">${idx+1}</span>
      <button class="ps-remove-exp ps-btn-icon">×</button>
    </div>
    <div class="ps-item-grid">
      <div class="form-field"><label class="field-label">Title</label>
        <input class="field-input" data-field="title" value="${escAttr(exp.title||'')}"/></div>
      <div class="form-field"><label class="field-label">Company</label>
        <input class="field-input" data-field="company" value="${escAttr(exp.company||'')}"/></div>
      <div class="form-field"><label class="field-label">Start</label>
        <input class="field-input" data-field="start" value="${escAttr(exp.start||'')}"/></div>
      <div class="form-field"><label class="field-label">End</label>
        <input class="field-input" data-field="end" value="${escAttr(exp.end||'Present')}"/></div>
    </div>
    <div class="form-field">
      <label class="field-label">What you did here <span class="field-optional">(just talk it out - detail, tools, scale, anything)</span></label>
      <textarea class="field-input field-textarea-tall" data-field="raw_description">${escHtml(exp.raw_description||'')}</textarea>
      <div class="ai-write-row">
        <button class="ps-btn-ghost ai-write-btn" data-ai-write="experience:${idx}" title="Turn these notes into resume bullets (uses AI)">
          <sl-icon library="lucide" name="sparkles"></sl-icon> Write with AI
        </button>
        <span class="ai-write-hint">Your notes are kept - this only fills in the bullets below.</span>
      </div>
      <div class="ai-draft-panel hidden"></div>
    </div>
    <div class="form-field"><label class="field-label">Resume bullets <span class="field-optional">(action verb + result)</span></label>
      <div class="highlights-editor">
        ${(exp.highlights||[]).map(h=>`<div class="highlight-row"><input class="field-input highlight-text" value="${escAttr(h)}"/><button class="ps-remove-highlight ps-btn-icon">×</button></div>`).join('')}
      </div>
      <button class="ps-add-highlight ps-btn-ghost" style="margin-top:6px">+ Add bullet</button>
    </div>
    <div class="form-field"><label class="field-label">Tags</label>
      <div class="tag-chips-edit">
        ${(exp.tags||[]).map(t=>`<span class="tag-chip-tag" data-tag="${escAttr(t)}">${escHtml(t)}<button class="tag-chip-remove">×</button></span>`).join('')}
        <input class="tag-add-input" placeholder="Add tag, press Enter"/>
      </div>
    </div>
  </div>`;
}

function renderProjItemEdit(proj, idx) {
  return `<div class="ps-item-edit proj-item-edit" data-idx="${idx}" data-id="${escAttr(proj.id||'')}">
    <div class="ps-item-edit-header">
      <span class="ps-item-num">${idx+1}</span>
      <button class="ps-remove-proj ps-btn-icon">×</button>
    </div>
    <div class="form-field"><label class="field-label">Name</label>
      <input class="field-input" data-field="name" value="${escAttr(proj.name||'')}"/></div>
    <div class="form-field"><label class="field-label">One-line summary <span class="field-optional">(shown in display)</span></label>
      <input class="field-input" data-field="description" value="${escAttr(proj.description||'')}"/></div>
    <div class="form-field"><label class="field-label">URL <span class="field-optional">(optional)</span></label>
      <input class="field-input" data-field="url" value="${escAttr(proj.url||'')}"/></div>
    <div class="form-field">
      <label class="field-label">What this project is <span class="field-optional">(just talk it out - what it does, how you built it, anything)</span></label>
      <textarea class="field-input field-textarea-tall" data-field="raw_description">${escHtml(proj.raw_description||'')}</textarea>
      <div class="ai-write-row">
        <button class="ps-btn-ghost ai-write-btn" data-ai-write="projects:${idx}" title="Turn these notes into a summary line and resume bullets (uses AI)">
          <sl-icon library="lucide" name="sparkles"></sl-icon> Write with AI
        </button>
        <span class="ai-write-hint">Your notes are kept - this fills in the summary, bullets and tech.</span>
      </div>
      <div class="ai-draft-panel hidden"></div>
    </div>
    <div class="form-field"><label class="field-label">Tech stack</label>
      <div class="skill-chips-edit">
        ${(proj.tech||[]).map(t=>`<span class="skill-chip-tag" data-skill="${escAttr(t)}">${escHtml(t)}<button class="skill-chip-remove">×</button></span>`).join('')}
        <input class="skill-add-input" placeholder="Add tech, press Enter"/>
      </div>
    </div>
    <div class="form-field"><label class="field-label">Resume bullets <span class="field-optional">(action verb + result)</span></label>
      <div class="highlights-editor">
        ${(proj.highlights||[]).map(h=>`<div class="highlight-row"><input class="field-input highlight-text" value="${escAttr(h)}"/><button class="ps-remove-highlight ps-btn-icon">×</button></div>`).join('')}
      </div>
      <button class="ps-add-highlight ps-btn-ghost" style="margin-top:6px">+ Add bullet</button>
    </div>
    <div class="form-field"><label class="field-label">Tags</label>
      <div class="tag-chips-edit">
        ${(proj.tags||[]).map(t=>`<span class="tag-chip-tag" data-tag="${escAttr(t)}">${escHtml(t)}<button class="tag-chip-remove">×</button></span>`).join('')}
        <input class="tag-add-input" placeholder="Add tag, press Enter"/>
      </div>
    </div>
  </div>`;
}

// ── Profile: section edit/save/cancel ────────────────────────────────────────
function editSection(name) {
  state.editingSection = name;
  replaceSectionInDOM(name);
}

async function saveSection(name) {
  const data = collectSectionData(name);
  if (data === null) return;
  if (name === 'skills') state.profile.skill_buckets = data;
  else state.profile[name] = data;
  state.editingSection = null;
  try {
    await bridge.workspaceWrite(PROFILE_PATH, JSON.stringify(state.profile, null, 2));
    updateSidebarPersona();
    showToast('Saved.');
  } catch (_) { showToast('Save failed.'); }
  replaceSectionInDOM(name);
}

function cancelSection(name) {
  state.editingSection = null;
  replaceSectionInDOM(name);
}

// ── Profile: collect form data ────────────────────────────────────────────────
function collectSectionData(name) {
  const body = document.querySelector(`.profile-section[data-section="${name}"] .ps-body`);
  if (!body) return null;
  switch (name) {
    case 'identity': {
      const headline = body.querySelector('[data-field="headline"]').value.trim();
      // Variants live on state (mutated by the headline controls, which don't
      // round-trip through the DOM); keep the active one in the list too.
      const variants = [...new Set([
        ...((state.profile.identity || {}).headline_variants || []),
        ...(headline ? [headline] : []),
      ])].filter(Boolean);
      return {
        name:     body.querySelector('[data-field="name"]').value.trim(),
        headline,
        summary:  body.querySelector('[data-field="summary"]').value.trim(),
        location: body.querySelector('[data-field="location"]').value.trim(),
        headline_variants: variants,
      };
    }
    case 'contact':
      return {
        email: body.querySelector('[data-field="email"]').value.trim(),
        phone: body.querySelector('[data-field="phone"]').value.trim(),
        links: [...body.querySelectorAll('.link-entry')].map(row => ({
          label: row.querySelector('[data-subfield="label"]').value.trim(),
          url:   row.querySelector('[data-subfield="url"]').value.trim(),
        })).filter(l => l.url),
      };
    case 'skills':
      return [...body.querySelectorAll('.skill-bucket-edit')].map(bel => ({
        category: bel.querySelector('.bucket-name-input').value.trim(),
        skills:   [...bel.querySelectorAll('.skill-chip-tag')].map(el => el.dataset.skill).filter(Boolean),
      })).filter(b => b.category);
    case 'experience':
      return [...body.querySelectorAll('.exp-item-edit')].map(el => ({
        id:              el.dataset.id || `${Date.now()}${Math.random()}`,
        title:           el.querySelector('[data-field="title"]').value.trim(),
        company:         el.querySelector('[data-field="company"]').value.trim(),
        start:           el.querySelector('[data-field="start"]').value.trim(),
        end:             el.querySelector('[data-field="end"]').value.trim(),
        raw_description: el.querySelector('[data-field="raw_description"]').value.trim(),
        highlights:      [...el.querySelectorAll('.highlight-text')].map(i => i.value.trim()).filter(Boolean),
        tags:            [...el.querySelectorAll('.tag-chip-tag')].map(c => c.dataset.tag).filter(Boolean),
      }));
    case 'projects':
      return [...body.querySelectorAll('.proj-item-edit')].map(el => ({
        id:              el.dataset.id || `${Date.now()}${Math.random()}`,
        name:            el.querySelector('[data-field="name"]').value.trim(),
        description:     el.querySelector('[data-field="description"]').value.trim(),
        url:             el.querySelector('[data-field="url"]').value.trim(),
        raw_description: el.querySelector('[data-field="raw_description"]').value.trim(),
        tech:            [...el.querySelectorAll('.skill-chip-tag')].map(c => c.dataset.skill).filter(Boolean),
        highlights:      [...el.querySelectorAll('.highlight-text')].map(i => i.value.trim()).filter(Boolean),
        tags:            [...el.querySelectorAll('.tag-chip-tag')].map(c => c.dataset.tag).filter(Boolean),
      }));
    case 'education':
      return [...body.querySelectorAll('#edu-editor .ps-list-edit-row')].map(row => ({
        degree:      row.querySelector('[data-subfield="degree"]').value.trim(),
        institution: row.querySelector('[data-subfield="institution"]').value.trim(),
        year:        row.querySelector('[data-subfield="year"]').value.trim(),
        cgpa:        row.querySelector('[data-subfield="cgpa"]')?.value.trim() || '',
      })).filter(ed => ed.degree || ed.institution);
    case 'certifications':
      return [...body.querySelectorAll('#cert-editor .ps-list-edit-row')].map(row => ({
        name:   row.querySelector('[data-subfield="name"]').value.trim(),
        issuer: row.querySelector('[data-subfield="issuer"]').value.trim(),
        year:   row.querySelector('[data-subfield="year"]').value.trim(),
      })).filter(c => c.name);
    case 'publications':
      return [...body.querySelectorAll('#pub-editor .ps-list-edit-row')].map(row => ({
        title: row.querySelector('[data-subfield="title"]').value.trim(),
        venue: row.querySelector('[data-subfield="venue"]').value.trim(),
        year:  row.querySelector('[data-subfield="year"]').value.trim(),
        url:   row.querySelector('[data-subfield="url"]').value.trim(),
      })).filter(p => p.title);
    default: return null;
  }
}

// ── Profile: section event helpers (called from delegated handlers) ───────────
function addNewExpItem() {
  const ed = document.getElementById('exp-editor'); if (!ed) return;
  const idx = ed.querySelectorAll('.exp-item-edit').length;
  const tmp = document.createElement('div');
  tmp.innerHTML = renderExpItemEdit({id:'',title:'',company:'',start:'',end:'Present',raw_description:'',highlights:[],tags:[]}, idx);
  ed.appendChild(tmp.firstElementChild);
}
function addNewProjItem() {
  const ed = document.getElementById('proj-editor'); if (!ed) return;
  const idx = ed.querySelectorAll('.proj-item-edit').length;
  const tmp = document.createElement('div');
  tmp.innerHTML = renderProjItemEdit({id:'',name:'',description:'',raw_description:'',tech:[],url:'',highlights:[],tags:[]}, idx);
  ed.appendChild(tmp.firstElementChild);
}
function addNewBucket() {
  const ed = document.getElementById('buckets-editor'); if (!ed) return;
  const idx = ed.querySelectorAll('.skill-bucket-edit').length;
  const tmp = document.createElement('div');
  tmp.innerHTML = renderBucketEdit({category:'',skills:[]}, idx);
  ed.appendChild(tmp.firstElementChild);
}
function addSkillChip(container, skill) {
  const tag = document.createElement('span');
  tag.className = 'skill-chip-tag'; tag.dataset.skill = skill;
  tag.innerHTML = `${escHtml(skill)}<button class="skill-chip-remove">×</button>`;
  const input = container.querySelector('.skill-add-input');
  if (input) container.insertBefore(tag, input);
  else container.appendChild(tag);
}
function addTagChip(container, tag) {
  const el = document.createElement('span');
  el.className = 'tag-chip-tag'; el.dataset.tag = tag;
  el.innerHTML = `${escHtml(tag)}<button class="tag-chip-remove">×</button>`;
  const input = container.querySelector('.tag-add-input');
  if (input) container.insertBefore(el, input);
  else container.appendChild(el);
}
function addHighlightRow(editor) {
  const row = document.createElement('div'); row.className = 'highlight-row';
  row.innerHTML = `<input class="field-input highlight-text" value=""/><button class="ps-remove-highlight ps-btn-icon">×</button>`;
  editor.appendChild(row);
  row.querySelector('input').focus();
}
function addSimpleEditRow(editorId, fields) {
  const ed = document.getElementById(editorId); if (!ed) return;
  const row = document.createElement('div'); row.className = 'ps-list-edit-row';
  row.innerHTML = `<div class="ps-list-edit-fields">${
    fields.map(f => `<input class="field-input" data-subfield="${f.key}" placeholder="${f.placeholder}" value=""/>`).join('')
  }</div><button class="ps-remove-${editorId.split('-')[0]} ps-btn-icon">×</button>`;
  ed.appendChild(row);
}
function addLink() {
  const ed = document.getElementById('links-editor'); if (!ed) return;
  const row = document.createElement('div'); row.className = 'link-entry ps-list-row';
  row.innerHTML = `<input class="field-input" data-subfield="label" placeholder="Label" value=""/>
    <input class="field-input" data-subfield="url" placeholder="URL" value=""/>
    <button class="ps-remove-link ps-btn-icon">×</button>`;
  ed.appendChild(row);
}

// ── Jobs: persistence ────────────────────────────────────────────────────────
const JOBS_PATH = 'jobs/jobs.json';
const STATUS_LABELS = { saved: 'Saved', applied: 'Applied', responded: 'Responded', archived: 'Archived' };
const STATUS_COLORS = {
  saved: 'var(--accent)', applied: 'var(--green)',
  responded: '#f59e0b',   archived: 'var(--dim)',
};

async function loadJobs() {
  try {
    const res = await bridge.workspaceRead(JOBS_PATH);
    if (res && res.content && !res.error) { state.jobs = JSON.parse(res.content); return; }
  } catch (_) {}
  state.jobs = [];
}

async function persistJobs() {
  // Pending/error cards are in-memory only; transient flags never hit disk.
  const clean = state.jobs
    .filter(j => !j.pending && !j.error)
    .map(({ updating, analyzing, _url, ...rest }) => rest);
  await bridge.workspaceWrite(JOBS_PATH, JSON.stringify(clean, null, 2));
}

function jobById(id) { return state.jobs.find(j => j.id === id); }

function jsonClone(value, fallback = null) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch (_) { return fallback; }
}

async function readWorkspaceJson(path, fallback = null) {
  try {
    const res = await bridge.workspaceRead(path);
    if (res && res.content && !res.error) return JSON.parse(res.content);
  } catch (_) {}
  return jsonClone(fallback, fallback);
}

function analysisIndexPath(jobId) {
  return `${ANALYSIS_HISTORY_ROOT}/${jobId}/index.json`;
}

function analysisRunPath(jobId, runId) {
  return `${ANALYSIS_HISTORY_ROOT}/${jobId}/${runId}.json`;
}

function makeAnalysisRunId() {
  return `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeMatchSnapshot(result) {
  if (!result) return null;
  const {
    match_score, skills_matched, partial_matches, required_gaps, nice_to_have_gaps,
    screening_risks, analysis_meta, apply_readiness, summary, application_strategy,
    profile_gaps, relevant_experience, focus_areas, green_flags, relevant_projects,
  } = result;
  return jsonClone({
    match_score,
    skills_matched,
    partial_matches,
    required_gaps,
    nice_to_have_gaps,
    screening_risks,
    analysis_meta,
    apply_readiness,
    summary,
    application_strategy,
    profile_gaps,
    relevant_experience,
    focus_areas,
    green_flags,
    relevant_projects,
  });
}

function summarizeAnalysisSnapshot(snapshot) {
  return {
    score: snapshot?.match_score ?? null,
    verdict: snapshot?.apply_readiness?.verdict || '',
    required_gap_count: (snapshot?.required_gaps || []).length,
    partial_match_count: (snapshot?.partial_matches || []).length,
    screening_risk_count: (snapshot?.screening_risks || []).length,
    summary_preview: truncateText(snapshot?.summary || snapshot?.apply_readiness?.reason || '', 220),
  };
}

function buildAnalysisRunIndexEntry(run) {
  const deterministic = run.deterministic || null;
  const enriched = run.enriched || null;
  const latest = enriched || deterministic || null;
  return {
    id: run.id,
    created_at: run.created_at,
    trigger: run.trigger,
    status: enriched ? 'complete' : 'deterministic_only',
    deterministic_score: deterministic?.match_score ?? null,
    final_score: latest?.match_score ?? null,
    llm_delta: enriched && deterministic ? (enriched.match_score ?? 0) - (deterministic.match_score ?? 0) : 0,
    ...summarizeAnalysisSnapshot(latest),
  };
}

async function loadAnalysisHistory(jobId, { force = false } = {}) {
  if (!jobId) return { job_id: '', runs: [] };
  if (!force && state.analysisHistory[jobId]) return state.analysisHistory[jobId];
  state.analysisHistoryLoading[jobId] = true;
  if (state.activeJobId === jobId) renderJobDetailCards(jobById(jobId));
  const index = await readWorkspaceJson(analysisIndexPath(jobId), { job_id: jobId, runs: [] });
  state.analysisHistory[jobId] = index;
  delete state.analysisHistoryLoading[jobId];
  if (state.activeJobId === jobId) renderJobDetailCards(jobById(jobId));
  return index;
}

async function loadAnalysisSnapshot(jobId, runId) {
  if (!jobId || !runId) return null;
  state.analysisSnapshots[jobId] = state.analysisSnapshots[jobId] || {};
  if (state.analysisSnapshots[jobId][runId]) return state.analysisSnapshots[jobId][runId];
  const snapshot = await readWorkspaceJson(analysisRunPath(jobId, runId), null);
  if (snapshot) state.analysisSnapshots[jobId][runId] = snapshot;
  return snapshot;
}

async function persistAnalysisRun(job, { runId = null, createdAt = null, trigger = 'reanalyze', deterministic, enriched = null }) {
  if (!job?.id || !deterministic) return null;
  const id = runId || makeAnalysisRunId();
  const created_at = createdAt || new Date().toISOString();
  const run = {
    id,
    job_id: job.id,
    created_at,
    trigger,
    model: state.defaultModel || '',
    job_snapshot: {
      title: job.title || '',
      company: job.company || '',
      link: job.link || '',
      source_url: job.source_url || '',
    },
    deterministic: sanitizeMatchSnapshot(deterministic),
    enriched: sanitizeMatchSnapshot(enriched),
  };

  await bridge.workspaceWrite(analysisRunPath(job.id, id), JSON.stringify(run, null, 2));
  const index = await readWorkspaceJson(analysisIndexPath(job.id), { job_id: job.id, runs: [] });
  const entry = buildAnalysisRunIndexEntry(run);
  const existingIdx = (index.runs || []).findIndex(item => item.id === id);
  if (existingIdx >= 0) index.runs[existingIdx] = entry;
  else index.runs = [entry, ...(index.runs || [])];
  await bridge.workspaceWrite(analysisIndexPath(job.id), JSON.stringify({ job_id: job.id, runs: index.runs }, null, 2));

  state.analysisHistory[job.id] = { job_id: job.id, runs: index.runs };
  state.analysisSnapshots[job.id] = state.analysisSnapshots[job.id] || {};
  state.analysisSnapshots[job.id][id] = run;
  job.last_analysis_run_id = id;
  job.last_analysis_at = created_at;
  return { runId: id, createdAt: created_at };
}

async function deleteAnalysisHistory(jobId) {
  if (!jobId) return;
  const index = await readWorkspaceJson(analysisIndexPath(jobId), { job_id: jobId, runs: [] });
  for (const run of (index.runs || [])) {
    await bridge.workspaceDelete(analysisRunPath(jobId, run.id)).catch(() => {});
  }
  await bridge.workspaceDelete(analysisIndexPath(jobId)).catch(() => {});
  delete state.analysisHistory[jobId];
  delete state.analysisSnapshots[jobId];
}

function buildDeterministicReason(result) {
  const hardRequiredGaps = result?.analysis_meta?.hard_required_gaps || [];
  const screeningRisks = result?.screening_risks || [];
  const requiredGaps = result?.required_gaps || [];
  if (hardRequiredGaps.length) {
    return `Still missing required skills: ${hardRequiredGaps.slice(0, 3).join(', ')}.`;
  }
  if (screeningRisks.length) {
    return screeningRisks.map(r => r.reason).join(' ');
  }
  if (requiredGaps.length) {
    return `Core skill gaps are still visible in the screen: ${requiredGaps.slice(0, 3).join(', ')}.`;
  }
  return 'Core required skills are covered directly; screening risk is mostly tied to optional gaps.';
}

function applyIgnoredSkillsToDeterministic(result, ignoredSkills = []) {
  const ignored = new Set((ignoredSkills || []).map(normalizeSkillToken).filter(Boolean));
  if (!result || !ignored.size) return jsonClone(result, result);

  const next = jsonClone(result, result);
  const keepSkill = value => !ignored.has(normalizeSkillToken(value));
  const keepObjectSkill = value => !ignored.has(normalizeSkillToken(value?.skill || ''));

  next.skills_matched = (next.skills_matched || []).filter(keepSkill);
  next.required_gaps = (next.required_gaps || []).filter(keepSkill);
  next.nice_to_have_gaps = (next.nice_to_have_gaps || []).filter(keepSkill);
  next.partial_matches = (next.partial_matches || []).filter(keepObjectSkill);

  next.analysis_meta = next.analysis_meta || {};
  next.analysis_meta.evidence = next.analysis_meta.evidence || {};
  next.analysis_meta.evidence.matched_skills = (next.analysis_meta.evidence.matched_skills || []).filter(keepObjectSkill);
  next.analysis_meta.evidence.partial_matches = (next.analysis_meta.evidence.partial_matches || []).filter(keepObjectSkill);
  next.analysis_meta.hard_required_gaps = (next.analysis_meta.hard_required_gaps || []).filter(keepSkill);
  next.analysis_meta.hard_required_gap_count = next.analysis_meta.hard_required_gaps.length;
  next.analysis_meta.ignored_skills = [...ignored];

  const baseScore = computeScoreStrict(
    next.skills_matched || [],
    next.partial_matches || [],
    next.required_gaps || [],
    next.analysis_meta.hard_required_gap_count || 0
  );
  const riskPenalty = (next.screening_risks || []).reduce((sum, r) => sum + (r.penalty || 0), 0);
  next.analysis_meta.base_score = baseScore;
  next.analysis_meta.risk_penalty = riskPenalty;
  next.match_score = Math.max(5, Math.min(95, baseScore - riskPenalty));
  next.apply_readiness = next.apply_readiness || {};
  next.apply_readiness.verdict = computeVerdictStrict(
    next.match_score,
    next.required_gaps || [],
    next.screening_risks || [],
    next.analysis_meta.hard_required_gap_count || 0
  );
  next.apply_readiness.reason = buildDeterministicReason(next);
  return next;
}

function latestAnalysisHistoryEntry(jobId) {
  return state.analysisHistory[jobId]?.runs?.[0] || null;
}

function normalizedSkillSet(values = []) {
  return [...new Set((values || []).map(normalizeSkillToken).filter(Boolean))].sort();
}

function sameSkillSelection(left = [], right = []) {
  const a = normalizedSkillSet(left);
  const b = normalizedSkillSet(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function computeDisplayedDeterministic(job) {
  return applyIgnoredSkillsToDeterministic(
    computeMatchDeterministic(state.profile || {}, job),
    job.analysis_ignored_skills || []
  );
}

function buildAnalysisDisplayResult(job) {
  if (!job?.match_result) return null;
  const currentIgnored = job.analysis_ignored_skills || [];
  const appliedIgnored = job.match_result?.analysis_meta?.ignored_skills || [];
  const enrichmentStale = !sameSkillSelection(currentIgnored, appliedIgnored);
  if (!state.profile) {
    return {
      ...job.match_result,
      analysis_state: {
        ignored_skills: currentIgnored,
        ignored_count: currentIgnored.length,
        latest_history: latestAnalysisHistoryEntry(job.id),
        enrichment_stale: enrichmentStale,
        baseline_lists: {
          skills_matched: job.match_result.skills_matched || [],
          partial_matches: job.match_result.partial_matches || [],
          required_gaps: job.match_result.required_gaps || [],
          nice_to_have_gaps: job.match_result.nice_to_have_gaps || [],
        },
      },
    };
  }
  const baseline = computeMatchDeterministic(state.profile || {}, job);
  const deterministic = applyIgnoredSkillsToDeterministic(
    baseline,
    currentIgnored
  );
  const base = job.match_result || {};
  const mergedProjects = (deterministic.relevant_projects || []).map(pr => ({
    ...pr,
    talking_points: (base.relevant_projects || []).find(item => item.id === pr.id)?.talking_points || [],
  }));

  return {
    ...deterministic,
    summary: base.summary || deterministic.summary || '',
    application_strategy: base.application_strategy || '',
    profile_gaps: base.profile_gaps || [],
    relevant_experience: base.relevant_experience || '',
    focus_areas: base.focus_areas || [],
    green_flags: base.green_flags || [],
    relevant_projects: mergedProjects,
    analysis_state: {
      ignored_skills: currentIgnored,
      ignored_count: currentIgnored.length,
      latest_history: latestAnalysisHistoryEntry(job.id),
      enrichment_stale: enrichmentStale,
      baseline_lists: {
        skills_matched: baseline.skills_matched || [],
        partial_matches: baseline.partial_matches || [],
        required_gaps: baseline.required_gaps || [],
        nice_to_have_gaps: baseline.nice_to_have_gaps || [],
      },
    },
  };
}

async function syncJobDisplayedScore(job, { persist = true } = {}) {
  if (!job?.match_result) return;
  const display = buildAnalysisDisplayResult(job);
  if (!display) return;
  job.match_score = display.match_score;
  if (persist) await persistJobs();
}

async function toggleIgnoredAnalysisSkill(skill) {
  const job = jobById(state.activeJobId);
  if (!job || !skill) return;
  const norm = normalizeSkillToken(skill);
  const current = new Set((job.analysis_ignored_skills || []).map(normalizeSkillToken).filter(Boolean));
  if (current.has(norm)) current.delete(norm);
  else current.add(norm);
  job.analysis_ignored_skills = [...current];
  await syncJobDisplayedScore(job);
  renderJobDetailCards(job);
  refreshMountedExportFlow();
  renderJobsDashboard();
}

async function resetIgnoredAnalysisSkills() {
  const job = jobById(state.activeJobId);
  if (!job || !(job.analysis_ignored_skills || []).length) return;
  job.analysis_ignored_skills = [];
  await syncJobDisplayedScore(job);
  renderJobDetailCards(job);
  refreshMountedExportFlow();
  renderJobsDashboard();
}

// ── Jobs: sub-view management ────────────────────────────────────────────────
function showJobsSubview(name) {
  ['dashboard', 'add', 'detail'].forEach(n =>
    document.getElementById(`jobs-${n}`).classList.toggle('hidden', n !== name));
  if (name === 'detail') {
    const activeTab = document.querySelector('.detail-tab.active')?.dataset.tab || 'analysis';
    syncChrome('jobs', { section: 'detail', tab: activeTab, job: jobById(state.activeJobId) });
    return;
  }
  syncChrome('jobs', { section: name });
}

// ── Jobs: dashboard ──────────────────────────────────────────────────────────
function renderJobsDashboard() {
  const grid  = document.getElementById('job-cards');
  const empty = document.getElementById('jobs-empty-state');
  if (!state.jobs.length) {
    empty.classList.remove('hidden'); grid.classList.add('hidden'); return;
  }
  empty.classList.add('hidden'); grid.classList.remove('hidden');
  grid.innerHTML = state.jobs.map(job => {
    // Background extraction states - keep the dashboard alive while work runs.
    if (job.pending || job.updating) {
      return `<div class="job-card job-card-busy" data-id="${escAttr(job.id)}">
        <div class="jc-spinner"></div>
        <div class="jc-body">
          <div class="jc-title">${escHtml(job.updating ? (job.title || 'Updating…') : 'Analyzing…')}</div>
          <div class="jc-company jc-busy-url">${escHtml(job.link || job.source_url || '')}</div>
        </div>
      </div>`;
    }
    if (job.error) {
      return `<div class="job-card job-card-error" data-id="${escAttr(job.id)}">
        <sl-icon class="jc-err-icon" library="lucide" name="circle-alert"></sl-icon>
        <div class="jc-body">
          <div class="jc-title">Couldn't add job</div>
          <div class="jc-company jc-busy-url">${escHtml(job.error)}</div>
        </div>
        <div class="jc-right jc-err-actions">
          <button class="jc-retry"   data-id="${escAttr(job.id)}">Retry</button>
          <button class="jc-dismiss" data-id="${escAttr(job.id)}">Dismiss</button>
        </div>
      </div>`;
    }
    const score    = job.match_score != null ? job.match_score : null;
    const scoreCol = score != null ? scoreColorFor(score) : 'var(--dim)';
    const statCol  = STATUS_COLORS[job.status] || 'var(--dim)';
    const mr       = job.match_result;
    const topSkills = (mr?.skills_matched || []).slice(0, 3);
    const date = job.created_at
      ? new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';
    const ring = job.analyzing
      ? `<div class="jc-score-ring jc-ring-busy"><div class="jc-spinner"></div></div>`
      : `<div class="jc-score-ring" style="--c:${scoreCol};--score:${score ?? 0}">
        <span class="jc-score-num">${score != null ? score : '?'}</span>
      </div>`;
    return `<div class="job-card" data-id="${escAttr(job.id)}">
      ${ring}
      <div class="jc-body">
        <div class="jc-title">${escHtml(job.title || 'Untitled Role')}</div>
        ${job.company ? `<div class="jc-company">${escHtml(job.company)}</div>` : ''}
        ${topSkills.length ? `<div class="jc-skills">${
          topSkills.map(s => `<span class="chip jc-skill-chip">${escHtml(s)}</span>`).join('')
          }${(mr?.skills_matched||[]).length > 3 ? `<span class="jc-more">+${(mr.skills_matched.length-3)}</span>` : ''}</div>` : ''}
      </div>
      <div class="jc-right">
        <div class="job-status-wrap">
          <span class="job-status-badge" style="--status-color:${statCol}">${escHtml(STATUS_LABELS[job.status] || job.status)}</span>
          <select class="job-status-select" data-id="${escAttr(job.id)}" onclick="event.stopPropagation()">
            ${Object.entries(STATUS_LABELS).map(([v, l]) =>
              `<option value="${v}"${job.status === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        ${date ? `<div class="jc-date">${escHtml(date)}</div>` : ''}
        <div class="jc-actions">
          ${job.link ? `<a class="job-link-icon" href="${escAttr(normalizeUrl(job.link))}" title="Open apply link"
            target="_blank" onclick="event.stopPropagation()">
            <sl-icon library="lucide" name="external-link"></sl-icon></a>` : ''}
          <button class="jc-delete-btn" data-id="${escAttr(job.id)}" title="Delete job">
            <sl-icon library="lucide" name="trash-2"></sl-icon></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

let _pendingDeleteId = null;

function openDeleteJobDialog(id) {
  const job = jobById(id);
  if (!job) return;
  _pendingDeleteId = id;
  const name = job.title || 'Untitled Role';
  const company = job.company ? ` at ${job.company}` : '';
  document.getElementById('delete-job-dialog-body').innerHTML =
    `Delete <strong>${escHtml(name)}</strong>${escHtml(company)}? This removes the job and its analysis and resume draft. This cannot be undone.`;
  document.getElementById('delete-job-dialog').show();
}

async function doDeleteJob() {
  const id = _pendingDeleteId;
  _pendingDeleteId = null;
  if (!id) return;
  const confirmBtn = document.getElementById('btn-delete-job-confirm');
  confirmBtn.loading = true; confirmBtn.disabled = true;
  document.getElementById('btn-delete-job-cancel').disabled = true;
  try {
    await doDeleteJobInner(id);
  } finally {
    confirmBtn.loading = false; confirmBtn.disabled = false;
    document.getElementById('btn-delete-job-cancel').disabled = false;
    document.getElementById('delete-job-dialog').hide();
  }
}

async function doDeleteJobInner(id) {
  const job = jobById(id);
  await deleteAnalysisHistory(id);
  state.jobs = state.jobs.filter(j => j.id !== id);
  await persistJobs();
  if (state.activeJobId === id) {
    state.activeJobId = null;
    renderJobsDashboard();
    showJobsSubview('dashboard');
  } else {
    refreshJobsIfVisible();
  }
  showToast(`Deleted: ${job?.title || 'job'}`);
}

async function updateJobStatus(id, status) {
  const job = jobById(id);
  if (!job) return;
  job.status = status;
  await persistJobs();
  const statCol = STATUS_COLORS[status] || 'var(--dim)';
  document.querySelectorAll(`.job-status-select[data-id="${id}"]`).forEach(sel => {
    const badge = sel.previousElementSibling;
    if (badge?.classList.contains('job-status-badge')) {
      badge.textContent = STATUS_LABELS[status] || status;
      badge.style.setProperty('--status-color', statCol);
    }
  });
}

// ── Jobs: add job ────────────────────────────────────────────────────────────
function openAddJobView() {
  ['add-job-title', 'add-job-company', 'add-job-link', 'add-job-desc']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('add-job-match-empty').classList.remove('hidden');
  document.getElementById('add-job-match-results').classList.add('hidden');
  document.getElementById('add-job-status-msg').classList.add('hidden');
  document.getElementById('btn-save-job').disabled = true;
  document.getElementById('btn-save-job').loading  = false;
  showJobsSubview('add');
}

async function saveAndAnalyzeJob() {
  const title       = document.getElementById('add-job-title').value.trim();
  const company     = document.getElementById('add-job-company').value.trim();
  const link        = document.getElementById('add-job-link').value.trim();
  const description = document.getElementById('add-job-desc').value.trim();
  if (!description) { showToast('Add a job description first.'); return; }

  if (!state.profile) {
    const ok = await loadProfile();
    if (!ok) { showToast('Generate your About Me profile first.'); return; }
  }

  const job = {
    id: Date.now().toString(), title: title || 'Untitled Role',
    company, link, description, status: 'saved',
    match_score: null, match_result: null, score_history: [],
    resume_draft: null, resume_extra_skills: [],
    created_at: new Date().toISOString(),
  };
  state.jobs.unshift(job);
  await persistJobs();

  const btn   = document.getElementById('btn-save-job');
  const msg   = document.getElementById('add-job-status-msg');
  const label = [title, company].filter(Boolean).join(' · ');
  btn.loading = true; btn.disabled = true;
  msg.textContent = 'Scoring skills…'; msg.classList.remove('hidden');

  // Phase 1 - deterministic, instant
  const profile = state.profile || {};
  const partial = state.profile ? computeDisplayedDeterministic(job) : computeMatchDeterministic(profile, job);
  job.match_score  = partial.match_score;
  job.match_result = partial;
  const analysisRun = await persistAnalysisRun(job, {
    trigger: 'save_and_analyze',
    deterministic: partial,
  });
  await persistJobs();
  renderMatchInto('add-job-match', partial, label);
  injectEnrichingShimmer('add-job-match');
  msg.textContent = 'Skills scored - enriching with AI…';

  // Phase 2 - LLM narrative enrichment
  try {
    const full = await enrichMatchWithLLM(profile, job, partial);
    job.match_score  = full.match_score;
    job.match_result = full;
    await persistAnalysisRun(job, {
      runId: analysisRun?.runId,
      createdAt: analysisRun?.createdAt,
      trigger: 'save_and_analyze',
      deterministic: partial,
      enriched: full,
    });
    await persistJobs();
    removeEnrichingShimmer('add-job-match');
    renderMatchInto('add-job-match', full, label);
    msg.classList.add('hidden');
    showToast('Job saved and analyzed.');
  } catch (e) {
    removeEnrichingShimmer('add-job-match');
    msg.textContent = `Saved - AI enrichment failed: ${e.message}`;
    showToast('Job saved; enrichment failed.');
  } finally {
    btn.loading = false; btn.disabled = false;
  }
}

// ── Jobs: paste-to-analyze ────────────────────────────────────────────────────
// On the Jobs dashboard, Ctrl/Cmd+V with a URL in the clipboard offers to scrape
// the page and extract a structured job via the `job-extract` agent. Opt-in by
// design (token cost), so it always asks before running anything.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;
let _pendingPasteUrl = null;   // URL awaiting confirmation in the paste dialog
let _dupCtx = null;            // { url, jobId } when the URL is already saved

function detectUrl(text) {
  const m = (text || '').match(URL_RE);
  if (!m) return null;
  return m[0].replace(/[.,;:!?]+$/, '');   // strip trailing sentence punctuation
}

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function normalizeUrl(u) { return (u || '').replace(/\/+$/, '').toLowerCase(); }

function findJobByUrl(url) {
  const n = normalizeUrl(url);
  return state.jobs.find(j => normalizeUrl(j.link) === n || normalizeUrl(j.source_url) === n);
}

function onGlobalPaste(e) {
  // Only on the Jobs dashboard, never while typing in a field or over a dialog.
  if (!document.getElementById('view-jobs')?.classList.contains('active')) return;
  if (document.getElementById('jobs-dashboard')?.classList.contains('hidden')) return;
  if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
  if (document.querySelector('sl-dialog[open]')) return;
  const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  const url = detectUrl(text);
  if (!url) return;            // plain text paste → leave default behavior alone
  e.preventDefault();
  const existing = findJobByUrl(url);
  if (existing) openDupDialog(url, existing);
  else openPasteJobDialog(url);
}

function openPasteJobDialog(url) {
  _pendingPasteUrl = url;
  document.getElementById('paste-job-url').textContent = url;
  document.getElementById('paste-job-dialog').show();
}

function openDupDialog(url, job) {
  _dupCtx = { url, jobId: job.id };
  document.getElementById('dup-job-name').textContent = job.title || 'Untitled Role';
  document.getElementById('dup-job-dialog').show();
}

// Build the cleaned dump handed to the extraction agent (bounded for token cost).
function buildScrapeDump(url, scrape) {
  const MAX = 14000;
  let text = (scrape.text || '').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > MAX) text = text.slice(0, MAX) + '\n\n[...truncated...]';
  return `SOURCE URL: ${url}\nPAGE TITLE: ${scrape.title || ''}\n\nPAGE TEXT:\n${text}`;
}

async function runJobExtract(dump, retry) {
  const prompt = retry
    ? 'Your previous attempt did not produce a readable output file, or the file was missing '
      + '"title" / "description". Write the complete JSON to the OUTPUT_FILE now.\n\n' + dump
    : dump;
  try { return await runAgentToFile('job-extract', prompt); } catch (_) { return null; }
}

function validExtraction(x) {
  return !!(x && typeof x === 'object' && (x.title || '').trim() && (x.description || '').trim());
}

// Merge agent-extracted fields onto a new or existing job; the app owns identity,
// status, and provenance fields and never trusts them to the agent.
function mergeJob(existing, ex, url, scrape, retried) {
  const now = new Date().toISOString();
  const base = existing || {
    id: Date.now().toString(),
    status: 'saved',
    created_at: now,
    match_score: null, match_result: null, score_history: [],
    resume_draft: null, resume_extra_skills: [],
  };
  return {
    ...base,
    title:        ex.title || base.title || 'Untitled Role',
    company:      ex.company || base.company || '',
    link:         url,                         // app-owned: always the source URL
    description:  ex.description || base.description || '',
    location:     ex.location || '',
    workplace_type:  ex.workplace_type || '',
    employment_type: ex.employment_type || '',
    seniority:    ex.seniority || '',
    compensation: ex.compensation || null,
    responsibilities: ex.responsibilities || [],
    requirements:     ex.requirements || [],
    nice_to_have:     ex.nice_to_have || [],
    skills:       ex.skills || [],
    posted_date:  ex.posted_date || '',
    application_deadline: ex.application_deadline || '',
    apply_url:    ex.apply_url || '',
    source:       ex.source || '',
    source_url:   url,
    scraped_at:   now,
    extraction:   { method: 'paste', chars_scraped: (scrape.text || '').length, retried: !!retried },
  };
}

function dismissErroredJob(id) {
  state.jobs = state.jobs.filter(j => j.id !== id);
  refreshJobsIfVisible();
}

function retryErroredJob(id) {
  const job = state.jobs.find(j => j.id === id);
  if (!job) return;
  const url = job._url || job.link || job.source_url;
  state.jobs = state.jobs.filter(j => j.id !== id);   // drop the error card; a fresh spinner replaces it
  if (url) startPasteAnalyze(url, null);
}

// Re-render the dashboard only when it's the visible view, so background work
// never yanks the user out of whatever they're doing.
function refreshJobsIfVisible() {
  if (document.getElementById('view-jobs')?.classList.contains('active') &&
      !document.getElementById('jobs-dashboard')?.classList.contains('hidden')) {
    renderJobsDashboard();
  }
}

// Kick off extraction in the BACKGROUND: drop a spinner card on the dashboard
// immediately, return control to the user, and resolve the card when done.
// Supports any number of concurrent pastes (each gets its own card).
function startPasteAnalyze(url, existingId) {
  document.getElementById('paste-job-dialog').hide();
  document.getElementById('dup-job-dialog').hide();
  _pendingPasteUrl = null;
  _dupCtx = null;

  let placeholderId;
  if (existingId) {
    const job = jobById(existingId);
    if (job) { job.updating = true; delete job.error; }
    placeholderId = existingId;
  } else {
    placeholderId = 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    state.jobs.unshift({
      id: placeholderId, pending: true, status: 'saved',
      title: 'Analyzing…', company: '', link: url, source_url: url,
      created_at: new Date().toISOString(),
    });
  }
  showJobsSubview('dashboard');
  refreshJobsIfVisible();
  extractJobInBackground(url, existingId, placeholderId);   // not awaited
}

async function extractJobInBackground(url, existingId, placeholderId) {
  const slotId = existingId || placeholderId;
  try {
    const scrape = await bridge.browserScrape(url);
    if (!scrape?.ok || !(scrape.text || '').trim()) {
      throw new Error(scrape?.error || 'Could not read the page');
    }
    const dump = buildScrapeDump(url, scrape);
    let extracted = await runJobExtract(dump, false);
    let retried = false;
    if (!validExtraction(extracted)) { retried = true; extracted = await runJobExtract(dump, true); }
    if (!validExtraction(extracted)) throw new Error('Extraction did not return a usable job');

    const existing = existingId ? jobById(existingId) : null;
    const merged   = mergeJob(existing, extracted, url, scrape, retried);
    delete merged.pending; delete merged.updating; delete merged.error;

    const idx = state.jobs.findIndex(j => j.id === slotId);
    if (idx !== -1) state.jobs[idx] = merged; else state.jobs.unshift(merged);
    await persistJobs();
    refreshJobsIfVisible();

    // Auto-chain match analysis only when opted in (Settings toggle).
    // Phase 1 (deterministic) runs instantly and updates the card immediately.
    // Phase 2 (LLM enrichment) fires in the background without blocking the paste flow.
    if (state.autoAnalyzePaste) {
      if (!state.profile) await loadProfile();
      if (state.profile) {
        const partial = computeDisplayedDeterministic(merged);
        merged.match_score  = partial.match_score;
        merged.match_result = partial;
        const analysisRun = await persistAnalysisRun(merged, {
          trigger: existingId ? 'update_scrape_analyze' : 'scrape_analyze',
          deterministic: partial,
        });
        await persistJobs();
        refreshJobsIfVisible();

        enrichMatchWithLLM(state.profile, merged, partial).then(async full => {
          const live = jobById(merged.id);
          if (!live) return;
          live.match_score  = full.match_score;
          live.match_result = full;
          await persistAnalysisRun(live, {
            runId: analysisRun?.runId,
            createdAt: analysisRun?.createdAt,
            trigger: existingId ? 'update_scrape_analyze' : 'scrape_analyze',
            deterministic: partial,
            enriched: full,
          });
          await persistJobs();
          if (state.activeJobId === live.id) {
            renderJobDetailCards(live);
            refreshMountedExportFlow();
          }
          refreshJobsIfVisible();
        }).catch(() => {}); // enrichment failure is non-fatal; Phase 1 result already saved
      }
    }
    showToast(existingId ? `Updated: ${merged.title}` : `Added: ${merged.title}`);
  } catch (e) {
    const idx = state.jobs.findIndex(j => j.id === slotId);
    if (idx !== -1) {
      if (existingId) {
        delete state.jobs[idx].updating;   // revert the existing card to normal
      } else {
        // Turn the spinner card into a dismissible error card - app stays usable.
        state.jobs[idx] = {
          ...state.jobs[idx], pending: false, error: e.message || 'Extraction failed', _url: url,
        };
      }
    }
    refreshJobsIfVisible();
    showToast(`Couldn't add job: ${e.message}`);
  }
}

// ── Jobs: detail tab switching ────────────────────────────────────────────────
// Measures the actual pixel height available below the active tab pane's top
// edge and publishes it as --pane-h. Called on resize and whenever the detail
// view changes so both .app-layout and .resume-tab-layout track the live window.
function updatePaneHeight() {
  const pane = document.querySelector('.detail-tab-pane:not(.hidden)');
  if (!pane) return;
  const top = pane.getBoundingClientRect().top;
  const h   = Math.max(300, Math.floor(window.innerHeight - top - 28)); // 28 = bottom padding
  document.documentElement.style.setProperty('--pane-h', h + 'px');
}

function switchDetailTab(name) {
  ['analysis', 'resume'].forEach(n => {
    document.getElementById(`tab-${n}`).classList.toggle('hidden', n !== name);
    document.querySelector(`.detail-tab[data-tab="${n}"]`)?.classList.toggle('active', n === name);
  });
  const job = jobById(state.activeJobId);
  if (job) syncChrome('jobs', { section: 'detail', tab: name, job });
  if (name === 'resume') {
    // Mount only when arriving on the tab, so selections survive tab flipping.
    if (job && !document.querySelector('#job-resume-mount .export-layout')) {
      showJobResumeFlow(job);
    } else {
      scaleAllResumePanes();
    }
  }
  updatePaneHeight();
}

// ── Jobs: detail ─────────────────────────────────────────────────────────────
function showJobDetail(id) {
  const job = jobById(id);
  if (!job) return;
  state.activeJobId = id;
  const statCol = STATUS_COLORS[job.status] || 'var(--dim)';

  document.getElementById('detail-header-info').innerHTML =
    `<div class="detail-htitle">${escHtml(job.title || 'Untitled Role')}</div>` +
    (job.company ? `<div class="detail-hcompany">${escHtml(job.company)}</div>` : '');

  const badge = document.getElementById('detail-status-badge');
  badge.textContent = STATUS_LABELS[job.status] || job.status;
  badge.style.setProperty('--status-color', statCol);

  const sel = document.getElementById('detail-status-select');
  sel.dataset.id = job.id;
  sel.innerHTML = Object.entries(STATUS_LABELS)
    .map(([v, l]) => `<option value="${v}"${job.status === v ? ' selected' : ''}>${l}</option>`).join('');

  // Close any application/setup session open for a different job's tab
  if (state.browser.port && state.browser.jobId !== id) closeApplicationBrowser();

  renderJobDetailCards(job);
  refreshMountedExportFlow();
  loadAnalysisHistory(id).catch(() => {});
  switchDetailTab('analysis');
  showJobsSubview('detail');
  // Measure available height after DOM has settled for this detail view.
  requestAnimationFrame(updatePaneHeight);
}

// ── Job detail: card renderer ─────────────────────────────────────────────────
function mcIcon(path) {
  return `<svg class="mc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
const MC_ICONS = {
  layers:    `<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9A1 1 0 0 0 22 6z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`,
  briefcase: `<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>`,
  folder:    `<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>`,
  trending:  `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>`,
  file:      `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="10" x2="16" y1="13" y2="13"/><line x1="10" x2="14" y1="17" y2="17"/>`,
};

function renderJobDetailCardsLegacy(job) {
  const empty  = document.getElementById('detail-match-empty');
  const el     = document.getElementById('detail-match-results');
  const m      = job.match_result;

  if (!m) { empty.classList.remove('hidden'); el.classList.add('hidden'); return; }

  const score  = Math.max(0, Math.min(100, m.match_score || 0));
  const col    = scoreColorFor(score);

  const RD_CFG = {
    apply_now: { cls: 'rd-go',      icon: '✓', label: 'Apply now' },
    stretch:   { cls: 'rd-stretch', icon: '◎', label: 'Stretch role' },
    not_yet:   { cls: 'rd-stop',    icon: '✕', label: 'Not yet' },
  };
  const rd    = m.apply_readiness || {};
  const rdc   = RD_CFG[rd.verdict] || null;

  // helper: chip list
  const chips = (items, color) =>
    `<div class="chips">${items.map(s => `<span class="chip match-chip" style="--chip-color:${color}">${escHtml(String(s))}</span>`).join('')}</div>`;

  // helper: skill group block (only rendered if items exist)
  const skillGroup = (label, cls, items, body) =>
    items?.length ? `<div class="mc-skill-group">
      <div class="mc-skill-label ${cls}">${escHtml(label)} <span class="mc-skill-count">${items.length}</span></div>
      ${body(items)}
    </div>` : '';

  // helper: bullet list
  const dotList = (items, dotColor) =>
    `<ul class="mc-list">${items.map(s =>
      `<li><span class="mc-dot" style="background:${dotColor}"></span>${escHtml(String(s))}</li>`
    ).join('')}</ul>`;

  // ── Card 1: Hero ────────────────────────────────────────────────────────────
  const heroCard = `<div class="mc mc-hero">
    <div class="mc-score-row">
      <div class="mc-ring" style="--c:${col};--score:${score}"><span class="mc-ring-num">${score}</span></div>
      <p class="mc-summary">${escHtml(m.summary || '')}</p>
    </div>
    ${m.application_strategy ? `<div class="mc-strategy"><span class="mc-strategy-arrow">›</span>${escHtml(m.application_strategy)}</div>` : ''}
    ${rdc ? `<div class="mc-readiness ${rdc.cls}">
      <span class="mc-rd-icon">${rdc.icon}</span>
      <span class="mc-rd-label">${rdc.label}</span>
      ${rd.reason ? `<span class="mc-rd-reason">${escHtml(rd.reason)}</span>` : ''}
    </div>` : ''}
  </div>`;

  // ── Card 2: Skills ──────────────────────────────────────────────────────────
  const partialHtml = (m.partial_matches || []).map(pm => `
    <div class="partial-match-row">
      <span class="chip match-chip" style="--chip-color:var(--amber)">${escHtml(pm.skill || '')}</span>
      <span class="partial-match-reason">${escHtml(pm.reason || pm.bucket || '')}</span>
    </div>`).join('');

  const profileGaps     = normalizeGaps(m.profile_gaps);
  const profileGapNames = profileGaps.map(g => g.skill);
  const evidence        = m.analysis_meta?.evidence || {};
  const risks           = m.screening_risks || [];

  const skillsCard = `<div class="mc">
    <div class="mc-head">${mcIcon(MC_ICONS.layers)} Skills</div>
    <div class="mc-skill-blocks">
      ${skillGroup('Matched', 'sk-green', m.skills_matched, i => chips(i, 'var(--green)'))}
      ${(m.partial_matches || []).length ? `<div class="mc-skill-group">
        <div class="mc-skill-label sk-amber">Partial - adjacent family <span class="mc-skill-count">${m.partial_matches.length}</span></div>
        <div class="partial-matches">${partialHtml}</div>
      </div>` : ''}
      ${skillGroup('Required - gap', 'sk-red', m.required_gaps, i => chips(i, 'var(--red)'))}
      ${skillGroup('Preferred - gap', 'sk-dim', m.nice_to_have_gaps, i => chips(i, 'var(--dim)'))}
    </div>
    ${profileGapNames.length ? `<div class="mc-nudge">
      <span class="mc-nudge-icon">⚠</span>
      <div>Based on your experience descriptions, you likely also have <strong>${escHtml(profileGapNames.join(', '))}</strong> - but they're not listed in your profile skills. Add them and re-analyze for a more accurate score.</div>
    </div>` : ''}
  </div>`;

  const riskRows = risks.length ? risks.map(r => `
    <li class="mc-list-item">
      <div><strong>${escHtml(r.type === 'experience_years' ? 'Experience years' : r.type)}</strong>
      ${r.severity ? `<span class="mc-rd-label" style="margin-left:8px">${escHtml(r.severity)}</span>` : ''}</div>
      <div class="mc-prose">${escHtml(r.reason || '')}</div>
    </li>`).join('') : '';

  const matchedEvidenceRows = (evidence.matched_skills || []).slice(0, 6).map(ev => `
    <li class="mc-list-item">
      <div><strong>${escHtml(ev.skill || '')}</strong></div>
      <div class="mc-prose">${escHtml([ev.source_label, ev.source_name].filter(Boolean).join(' · '))}</div>
      ${ev.snippet ? `<div class="mc-prose">${escHtml(ev.snippet)}</div>` : ''}
    </li>`).join('');

  const projectAnchorRows = (evidence.project_anchors || []).slice(0, 3).map(pr => `
    <li class="mc-list-item">
      <div><strong>${escHtml(pr.name || '')}</strong></div>
      <div class="mc-prose">${escHtml([pr.matched_tech || [], pr.matched_tags || []].flat().filter(Boolean).join(', ') || pr.reason || '')}</div>
      ${pr.evidence ? `<div class="mc-prose">${escHtml(pr.evidence)}</div>` : ''}
    </li>`).join('');

  const evidenceCard = (riskRows || matchedEvidenceRows || projectAnchorRows) ? `<div class="mc">
    <div class="mc-head">${mcIcon(MC_ICONS.trending)} Screening risks &amp; evidence</div>
    ${riskRows ? `<div class="mc-subhead">Screening risks</div><ul class="mc-list">${riskRows}</ul>` : ''}
    ${matchedEvidenceRows ? `<div class="mc-subhead"${riskRows ? ' style="margin-top:16px"' : ''}>Matched evidence</div><ul class="mc-list">${matchedEvidenceRows}</ul>` : ''}
    ${projectAnchorRows ? `<div class="mc-subhead"${riskRows || matchedEvidenceRows ? ' style="margin-top:16px"' : ''}>Project anchors</div><ul class="mc-list">${projectAnchorRows}</ul>` : ''}
  </div>` : '';

  const history = state.analysisHistory[job.id]?.runs || [];
  const historyLoading = !!state.analysisHistoryLoading[job.id];
  const historyRows = history.slice(0, 8).map(run => {
    const delta = run.llm_delta || 0;
    const deltaCls = delta > 0 ? 'mc-history-delta-up' : delta < 0 ? 'mc-history-delta-down' : 'mc-history-delta-flat';
    const deltaText = delta > 0 ? `AI +${delta}` : delta < 0 ? `AI ${delta}` : 'AI ±0';
    const when = run.created_at
      ? new Date(run.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';
    const trigger = ({
      save_and_analyze: 'Manual save',
      scrape_analyze: 'Saved from URL',
      update_scrape_analyze: 'Updated from URL',
      reanalyze: 'Refreshed',
    })[run.trigger] || run.trigger || 'Run';
    const verdictLabel = ({
      apply_now: 'Strong match', stretch: 'A stretch', not_yet: 'Likely filtered',
    })[run.verdict] || '';
    return `<div class="mc-history-row">
      <div class="mc-history-main">
        <div class="mc-history-top">
          <span class="mc-history-date">${escHtml(when)}</span>
          <span class="mc-history-trigger">${escHtml(trigger)}</span>
          <span class="mc-history-score">Score ${escHtml(run.deterministic_score ?? '-')} → ${escHtml(run.final_score ?? '-')}</span>
          <span class="mc-history-delta ${deltaCls}">${escHtml(deltaText)}</span>
        </div>
        <div class="mc-history-meta">${verdictLabel ? `${escHtml(verdictLabel)} · ` : ''}${escHtml(run.required_gap_count || 0)} missing requirements · ${escHtml(run.screening_risk_count || 0)} risks</div>
        ${run.summary_preview ? `<div class="mc-prose">${escHtml(run.summary_preview)}</div>` : ''}
      </div>
      <button class="ps-btn-ghost mc-history-open" data-run-id="${escAttr(run.id)}">Preview</button>
    </div>`;
  }).join('');
  const historyCard = `<div class="mc">
    <div class="mc-head">${mcIcon(MC_ICONS.file)} Analysis history</div>
    ${historyLoading ? `<div class="mc-prose" style="color:var(--muted)">Loading saved runs…</div>` : ''}
    ${!historyLoading && historyRows ? `<div class="mc-history-list">${historyRows}</div>` : ''}
    ${!historyLoading && !historyRows ? `<div class="mc-prose" style="color:var(--muted)">Past analysis runs will appear here.</div>` : ''}
  </div>`;

  // ── Card 3: Experience ──────────────────────────────────────────────────────
  const expCard = m.relevant_experience ? `<div class="mc">
    <div class="mc-head">${mcIcon(MC_ICONS.briefcase)} Experience fit</div>
    <p class="mc-prose">${escHtml(m.relevant_experience)}</p>
  </div>` : '';

  // ── Card 4: Projects ────────────────────────────────────────────────────────
  const projCard = (m.relevant_projects || []).length ? `<div class="mc">
    <div class="mc-head">${mcIcon(MC_ICONS.folder)} Relevant projects &amp; what to say</div>
    <div class="mc-projects">${(m.relevant_projects || []).map(pr => `
      <div class="mc-proj">
        <div class="mc-proj-name">${escHtml(pr.name || '')}</div>
        <div class="mc-proj-reason">${escHtml(pr.reason || '')}</div>
        ${(pr.talking_points || []).length ? `
          <div class="mc-tp-label">What to say</div>
          <ul class="mc-tp-list">${pr.talking_points.map(tp => `<li>${escHtml(tp)}</li>`).join('')}</ul>
        ` : ''}
      </div>`).join('')}
    </div>
  </div>` : '';

  // ── Card 5: Strengths & gap closure ────────────────────────────────────────
  const hasStrengths = (m.green_flags || []).length;
  const hasFocus     = (m.focus_areas || []).length;
  const gapCard = (hasStrengths || hasFocus) ? `<div class="mc">
    <div class="mc-head">${mcIcon(MC_ICONS.trending)} Strengths &amp; closing the gap</div>
    ${hasStrengths ? `<div class="mc-subhead">Working in your favour</div>${dotList(m.green_flags, 'var(--green)')}` : ''}
    ${hasFocus ? `<div class="mc-subhead"${hasStrengths ? ' style="margin-top:16px"' : ''}>To improve your match</div>${dotList(m.focus_areas, 'var(--accent)')}` : ''}
    ${profileGaps.length ? `<div class="mc-nudge" style="margin-top:14px">
      <span class="mc-nudge-icon">⚠</span>
      <div>Your profile may be underselling you - the agent found skills implied by your experience that aren't listed. Update your profile and hit Re-analyze to see if your score improves.</div>
    </div>` : ''}
    ${rdc?.cls === 'rd-stop' ? `<div class="mc-nudge mc-nudge-soft" style="margin-top:14px">
      <span class="mc-nudge-icon">○</span>
      <div>This role has significant gaps at your current profile level. Consider building more direct experience before applying, or focus applications on closer matches while you grow into this space.</div>
    </div>` : ''}
  </div>` : '';

  // ── Card 6: JD (collapsible) ────────────────────────────────────────────────
  const jdCard = `<details class="mc mc-jd">
    <summary class="mc-head mc-jd-summary">${mcIcon(MC_ICONS.file)} Job Description</summary>
    <div class="mc-jd-content">${renderJD(job.description)}</div>
  </details>`;

  empty.classList.add('hidden');
  el.classList.remove('hidden');
  el.innerHTML = heroCard + skillsCard + evidenceCard + historyCard + expCard + projCard + gapCard + jdCard;
}

function renderJobDetailCards(job) {
  const empty = document.getElementById('detail-match-empty');
  const el = document.getElementById('detail-match-results');
  const m = buildAnalysisDisplayResult(job);

  if (!m) { empty.classList.remove('hidden'); el.classList.add('hidden'); return; }

  const score = Math.max(0, Math.min(100, m.match_score || 0));
  const scoreCol = scoreColorFor(score);
  const profileGaps = normalizeGaps(m.profile_gaps);
  const profileGapNames = profileGaps.map(g => g.skill).filter(Boolean);
  const evidence = m.analysis_meta?.evidence || {};
  const risks = m.screening_risks || [];
  const analysisState = m.analysis_state || {};
  const baselineLists = analysisState.baseline_lists || {};
  const history = state.analysisHistory[job.id]?.runs || [];
  const historyLoading = !!state.analysisHistoryLoading[job.id];
  const liveAiDelta = (job.match_result?.match_score ?? score) - score;
  const aiDelta = analysisState.enrichment_stale
    ? (analysisState.latest_history?.llm_delta ?? liveAiDelta)
    : liveAiDelta;
  const aiDeltaText = aiDelta > 0 ? `+${aiDelta}` : String(aiDelta);
  const aiDeltaTone = aiDelta > 0 ? 'up' : aiDelta < 0 ? 'down' : 'flat';
  const screeningScore = Math.max(0, Math.min(100, score + aiDelta));
  const openUrl = job.link || job.source_url || job.apply_url || '';

  const RD_CFG = {
    apply_now: { cls: 'rd-go', label: 'Strong screen' },
    stretch: { cls: 'rd-stretch', label: 'Stretch screen' },
    not_yet: { cls: 'rd-stop', label: 'Likely filtered' },
  };
  const rd = m.apply_readiness || {};
  const rdc = RD_CFG[rd.verdict] || null;

  const toggleChip = (skill, tone) => {
    const ignored = (analysisState.ignored_skills || []).some(item =>
      normalizeSkillToken(item) === normalizeSkillToken(skill));
    return `<button type="button"
      class="analysis-skill-chip ${ignored ? 'is-ignored' : ''}"
      data-analysis-skill="${escAttr(skill)}"
      data-tone="${escAttr(tone)}">
      <span>${escHtml(String(skill))}</span>
    </button>`;
  };

  const renderSkillGroup = (label, tone, items, note = '') => {
    if (!items?.length) return '';
    return `<div class="analysis-skill-group">
      <div class="analysis-section-head">
        <div>${escHtml(label)}</div>
        <span class="mc-skill-count">${items.length}</span>
      </div>
      ${note ? `<div class="analysis-section-note">${escHtml(note)}</div>` : ''}
      <div class="analysis-skill-grid">${items.map(item => toggleChip(item, tone)).join('')}</div>
    </div>`;
  };

  const renderPartialMatches = (items = []) => {
    if (!items.length) return '';
    return `<div class="analysis-skill-group">
      <div class="analysis-section-head">
        <div>Related to your skills</div>
        <span class="mc-skill-count">${items.length}</span>
      </div>
      <div class="analysis-partial-list">${items.map(item => `
        <div class="analysis-partial-row">
          ${toggleChip(item.skill || '', 'partial')}
          <div class="analysis-section-note">${escHtml(item.reason || item.bucket || '')}</div>
        </div>`).join('')}
      </div>
    </div>`;
  };

  const renderListRows = (items = [], emptyText = 'None captured yet.') => {
    if (!items.length) return `<div class="analysis-section-note">${escHtml(emptyText)}</div>`;
    return `<ul class="mc-list">${items.map(item => {
      if (typeof item === 'string') {
        return `<li><span class="mc-dot" style="background:var(--accent)"></span><div>${escHtml(item)}</div></li>`;
      }
      const label = item.skill || item.name || item.type || 'Item';
      const meta = [
        item.source_label,
        item.source_name,
        Array.isArray(item.evidence) ? item.evidence.join(', ') : '',
        Array.isArray(item.matched_tech) ? item.matched_tech.join(', ') : '',
      ].filter(Boolean).join(' | ');
      const body = item.snippet || item.reason || item.evidence || '';
      return `<li>
        <span class="mc-dot" style="background:var(--accent)"></span>
        <div>
          <div><strong>${escHtml(label)}</strong></div>
          ${meta ? `<div class="mc-prose">${escHtml(meta)}</div>` : ''}
          ${body ? `<div class="mc-prose">${escHtml(body)}</div>` : ''}
        </div>
      </li>`;
    }).join('')}</ul>`;
  };

  const historyRows = history.slice(0, 10).map(run => {
    const delta = run.llm_delta || 0;
    const deltaCls = delta > 0 ? 'analysis-history-delta-up' : delta < 0 ? 'analysis-history-delta-down' : 'analysis-history-delta-flat';
    const deltaText = delta > 0 ? `AI +${delta}` : delta < 0 ? `AI ${delta}` : 'AI 0';
    const when = run.created_at
      ? new Date(run.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';
    const trigger = ({
      save_and_analyze: 'Manual save',
      scrape_analyze: 'Saved from URL',
      update_scrape_analyze: 'Updated from URL',
      reanalyze: 'AI rerun',
    })[run.trigger] || run.trigger || 'Run';
    const verdictLabel = ({
      apply_now: 'Strong match', stretch: 'A stretch', not_yet: 'Likely filtered',
    })[run.verdict] || '';
    return `<details class="analysis-history-item">
      <summary class="analysis-history-row">
        <div>
          <div class="analysis-history-title">${escHtml(when || 'Saved run')}</div>
          <div class="analysis-history-meta">${escHtml(trigger)}${verdictLabel ? ` | ${escHtml(verdictLabel)}` : ''}</div>
        </div>
        <div class="analysis-history-stats">
          <span class="analysis-history-score">Score ${escHtml(run.deterministic_score ?? '-')} → ${escHtml(run.final_score ?? '-')}</span>
          <span class="${deltaCls}">${escHtml(deltaText)}</span>
        </div>
      </summary>
      <div class="analysis-history-body">
        <div class="analysis-section-note">${escHtml(run.required_gap_count || 0)} missing requirements | ${escHtml(run.screening_risk_count || 0)} risks</div>
        ${run.summary_preview ? `<p class="mc-prose">${escHtml(run.summary_preview)}</p>` : ''}
        <button type="button" class="ps-btn-ghost mc-history-open" data-run-id="${escAttr(run.id)}">Open saved snapshot</button>
      </div>
    </details>`;
  }).join('');

  const projectsHtml = (m.relevant_projects || []).length ? `<div class="mc-projects">${(m.relevant_projects || []).map(pr => `
    <div class="mc-proj">
      <div class="mc-proj-name">${escHtml(pr.name || '')}</div>
      <div class="mc-proj-reason">${escHtml(pr.reason || '')}</div>
      ${(pr.talking_points || []).length ? `
        <div class="mc-tp-label">Resume angle</div>
        <ul class="mc-tp-list">${pr.talking_points.map(tp => `<li>${escHtml(tp)}</li>`).join('')}</ul>
      ` : ''}
    </div>`).join('')}</div>` : `<div class="analysis-section-note">No projects highlighted for this run.</div>`;

  empty.classList.add('hidden');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="analysis-layout">
      <div class="analysis-main">
        <section class="mc mc-hero analysis-hero">
          <div class="mc-score-row">
            <div class="mc-ring" style="--c:${scoreCol};--score:${score}"><span class="mc-ring-num">${score}</span></div>
            <div>
              <div class="analysis-section-head">
                <div>Screen score</div>
                ${rdc ? `<span class="analysis-verdict-chip ${rdc.cls}">${escHtml(rdc.label)}</span>` : ''}
              </div>
              <p class="mc-summary">${escHtml(m.summary || rd.reason || '')}</p>
            </div>
          </div>
          ${m.application_strategy ? `<div class="mc-strategy"><span class="mc-strategy-arrow">></span>${escHtml(m.application_strategy)}</div>` : ''}
          <div class="analysis-kpi-strip">
            <div class="analysis-kpi" title="How much the AI's read differs from the score">
              <span class="analysis-kpi-label">AI adjustment</span>
              <strong class="analysis-kpi-delta-${aiDeltaTone}">${escHtml(aiDeltaText)}</strong>
            </div>
            <div class="analysis-kpi" title="Required skills in the job post that your profile doesn't cover">
              <span class="analysis-kpi-label">Missing requirements</span>
              <strong>${(m.required_gaps || []).length}</strong>
            </div>
            <div class="analysis-kpi" title="Things likely to get this application filtered out, like a years-of-experience cutoff">
              <span class="analysis-kpi-label">Risks</span>
              <strong>${risks.length}</strong>
            </div>
            <div class="analysis-kpi" title="Skills you excluded from the score">
              <span class="analysis-kpi-label">Excluded by you</span>
              <strong>${analysisState.ignored_count || 0}</strong>
            </div>
          </div>
          <div class="mc-readiness ${rdc?.cls || ''}">
            <span class="mc-rd-label">Why this score</span>
            <span class="mc-rd-reason">${escHtml(buildDeterministicReason(m))}</span>
          </div>
        </section>

        <section class="mc analysis-section-band">
          <div class="mc-head">${mcIcon(MC_ICONS.layers)} Skills counted in the score</div>
          <div class="analysis-section-note">Click a skill to exclude it from the score; click again to restore it.</div>
          ${renderSkillGroup('In your profile', 'matched', baselineLists.skills_matched || m.skills_matched || [])}
          ${renderPartialMatches(baselineLists.partial_matches || m.partial_matches || [])}
          ${renderSkillGroup('Required, but missing', 'required', baselineLists.required_gaps || m.required_gaps || [])}
          ${renderSkillGroup('Nice to have, missing', 'optional', baselineLists.nice_to_have_gaps || m.nice_to_have_gaps || [])}
          ${profileGapNames.length ? `<div class="mc-nudge">
            <span class="mc-nudge-icon">!</span>
            <div>Your profile likely implies <strong>${escHtml(profileGapNames.join(', '))}</strong>, but those skills are not listed directly yet.</div>
          </div>` : ''}
        </section>

        <section class="mc analysis-section-band">
          <div class="mc-head">${mcIcon(MC_ICONS.trending)} Evidence</div>
          <div class="analysis-pill-list">
            <div>
              <div class="analysis-section-head"><div>Matched skills</div></div>
              ${renderListRows((evidence.matched_skills || []).slice(0, 6), 'None found.')}
            </div>
            <div>
              <div class="analysis-section-head"><div>Supporting projects</div></div>
              ${renderListRows((evidence.project_anchors || []).slice(0, 4), 'None found.')}
            </div>
            <div>
              <div class="analysis-section-head"><div>Risks</div></div>
              ${renderListRows(risks, 'None detected.')}
            </div>
          </div>
        </section>

        ${m.relevant_experience ? `<section class="mc analysis-section-band">
          <div class="mc-head">${mcIcon(MC_ICONS.briefcase)} Experience fit</div>
          <p class="mc-prose">${escHtml(m.relevant_experience)}</p>
        </section>` : ''}

        <section class="mc analysis-section-band">
          <div class="mc-head">${mcIcon(MC_ICONS.folder)} Projects to highlight</div>
          ${projectsHtml}
        </section>

        <details class="mc mc-jd">
          <summary class="mc-head mc-jd-summary">${mcIcon(MC_ICONS.file)} Full job description</summary>
          <div class="mc-jd-content">${renderJD(job.description)}</div>
        </details>
      </div>

      <aside class="analysis-rail">
        <section class="mc analysis-actions-panel">
          <div class="mc-head">${mcIcon(MC_ICONS.trending)} Actions</div>
          <button type="button" id="btn-reanalyze-analysis" class="ps-save-btn analysis-primary-btn" title="Re-runs the AI summary and recommendations; the score itself stays the same">Refresh AI Analysis</button>
          ${openUrl ? `<button type="button" id="btn-open-job-browser" class="ps-btn-ghost analysis-secondary-btn" data-open-url="${escAttr(openUrl)}">Open job in browser</button>` : ''}
          ${(analysisState.ignored_count || 0) ? `<button type="button" id="btn-reset-ignored-skills" class="ps-btn-ghost analysis-secondary-btn">Restore excluded skills</button>` : ''}
          ${analysisState.enrichment_stale ? `<div class="analysis-stale-note">You changed which skills count since the last AI pass - refresh to bring the summary up to date.</div>` : ''}
        </section>

        <section class="mc analysis-rail-panel">
          <div class="mc-head">${mcIcon(MC_ICONS.layers)} Before you apply</div>
          <div class="analysis-kpi-strip analysis-kpi-strip-rail">
            <div class="analysis-kpi" title="Your score if a recruiter accepts the AI's framing of your experience">
              <span class="analysis-kpi-label">Potential score</span>
              <strong>${screeningScore}</strong>
            </div>
            <div class="analysis-kpi" title="Missing requirements that usually get an application rejected outright">
              <span class="analysis-kpi-label">Blocking gaps</span>
              <strong>${m.analysis_meta?.hard_required_gap_count || 0}</strong>
            </div>
          </div>
          ${(m.green_flags || []).length ? `
            <div class="analysis-section-head"><div>Working in your favor</div></div>
            ${renderListRows(m.green_flags, 'No standout green flags were saved.')}
          ` : ''}
          ${(m.focus_areas || []).length ? `
            <div class="analysis-section-head" style="margin-top:16px"><div>Focus before applying</div></div>
            ${renderListRows(m.focus_areas, 'No focus areas were saved.')}
          ` : ''}
          ${profileGapNames.length ? `<div class="mc-nudge" style="margin-top:14px">
            <span class="mc-nudge-icon">!</span>
            <div>Add missing implied skills to your profile only if you can defend them clearly in an interview.</div>
          </div>` : ''}
        </section>

        <section class="mc analysis-rail-panel">
          <div class="mc-head">${mcIcon(MC_ICONS.file)} History</div>
          ${historyLoading ? `<div class="analysis-section-note">Loading…</div>` : ''}
          ${!historyLoading && historyRows ? `<div class="analysis-history-list">${historyRows}</div>` : ''}
          ${!historyLoading && !historyRows ? `<div class="analysis-section-note">Past analysis runs will appear here.</div>` : ''}
        </section>
      </aside>
    </div>`;
}

async function openAnalysisSnapshot(runId) {
  const job = jobById(state.activeJobId);
  if (!job || !runId) return;
  const run = await loadAnalysisSnapshot(job.id, runId);
  if (!run) { showToast('Could not load that analysis snapshot.'); return; }

  const det = run.deterministic || {};
  const enr = run.enriched || null;
  const final = enr || det;
  const createdAt = run.created_at
    ? new Date(run.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const trigger = ({
    save_and_analyze: 'Manual save',
    scrape_analyze: 'Saved from URL',
    update_scrape_analyze: 'Updated from URL',
    reanalyze: 'Re-analyze',
  })[run.trigger] || run.trigger || 'Run';
  const llmDelta = enr && det ? (enr.match_score ?? 0) - (det.match_score ?? 0) : 0;
  const deltaText = llmDelta > 0 ? `+${llmDelta}` : String(llmDelta);
  const chips = (items, color) => (items || []).length
    ? `<div class="chips">${items.map(item => `<span class="chip match-chip" style="--chip-color:${color}">${escHtml(String(item))}</span>`).join('')}</div>`
    : '<span class="match-none">None</span>';
  const renderGapRows = arr => (arr || []).length
    ? `<ul class="mc-list">${arr.map(item => {
      const text = typeof item === 'string' ? item : item.skill || item.type || '';
      const reason = typeof item === 'string' ? '' : item.reason || '';
      return `<li><span class="mc-dot" style="background:var(--accent)"></span><div><div>${escHtml(text)}</div>${reason ? `<div class="mc-prose">${escHtml(reason)}</div>` : ''}</div></li>`;
    }).join('')}</ul>`
    : '<span class="match-none">None</span>';

  document.getElementById('analysis-history-dialog-body').innerHTML = `
    <div class="ah-meta-grid">
      <div class="ah-meta-card"><span class="ah-meta-label">When</span><strong>${escHtml(createdAt)}</strong></div>
      <div class="ah-meta-card"><span class="ah-meta-label">Trigger</span><strong>${escHtml(trigger)}</strong></div>
      <div class="ah-meta-card"><span class="ah-meta-label">Deterministic</span><strong>${escHtml(det.match_score ?? '-')}</strong></div>
      <div class="ah-meta-card"><span class="ah-meta-label">Final</span><strong>${escHtml(final.match_score ?? '-')}</strong></div>
      <div class="ah-meta-card"><span class="ah-meta-label">LLM delta</span><strong>${escHtml(deltaText)}</strong></div>
      <div class="ah-meta-card"><span class="ah-meta-label">Verdict</span><strong>${escHtml(final.apply_readiness?.verdict || '-')}</strong></div>
    </div>

    <div class="ah-section">
      <div class="mc-head">${mcIcon(MC_ICONS.layers)} Deterministic pass</div>
      <div class="ah-grid">
        <div><div class="mc-subhead">Matched</div>${chips(det.skills_matched, 'var(--green)')}</div>
        <div><div class="mc-subhead">Required gaps</div>${chips(det.required_gaps, 'var(--red)')}</div>
        <div><div class="mc-subhead">Partial matches</div>${renderGapRows(det.partial_matches)}</div>
        <div><div class="mc-subhead">Screening risks</div>${renderGapRows(det.screening_risks)}</div>
      </div>
      ${det.apply_readiness?.reason ? `<div class="mc-nudge" style="margin-top:14px"><span class="mc-nudge-icon">○</span><div>${escHtml(det.apply_readiness.reason)}</div></div>` : ''}
    </div>

    <div class="ah-section">
      <div class="mc-head">${mcIcon(MC_ICONS.trending)} Enriched pass</div>
      ${enr ? `
        ${enr.summary ? `<div class="mc-subhead">Summary</div><p class="mc-prose">${escHtml(enr.summary)}</p>` : ''}
        ${enr.application_strategy ? `<div class="mc-subhead" style="margin-top:14px">Application strategy</div><p class="mc-prose">${escHtml(enr.application_strategy)}</p>` : ''}
        <div class="ah-grid" style="margin-top:14px">
          <div><div class="mc-subhead">Green flags</div>${renderGapRows(enr.green_flags)}</div>
          <div><div class="mc-subhead">Focus areas</div>${renderGapRows(enr.focus_areas)}</div>
          <div><div class="mc-subhead">Profile gaps</div>${renderGapRows(enr.profile_gaps)}</div>
          <div><div class="mc-subhead">Relevant experience</div><p class="mc-prose">${escHtml(enr.relevant_experience || 'None saved')}</p></div>
        </div>
      ` : `<p class="mc-prose" style="color:var(--muted)">This run only saved the deterministic pass. The LLM enrichment did not complete for it.</p>`}
    </div>
  `;

  document.getElementById('analysis-history-dialog').show();
}

// ── Agent file-write runner ───────────────────────────────────────────────────
// Agents write JSON to a temp file in workspace/jobs/ rather than outputting
// raw text - eliminates fragile text parsing and lets OpenCode validate the file.
async function runAgentToFile(agentId, promptText) {
  const runId   = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outRel  = `jobs/.tmp-${agentId}-${runId}.json`;
  const fullText = `${promptText}\n\nOUTPUT_FILE: workspace/${outRel}`;
  await runAgentPrompt(agentId, fullText);
  const file = await bridge.workspaceRead(outRel);
  bridge.workspaceDelete(outRel).catch(() => {});   // fire-and-forget cleanup
  if (file.error || !file.content) throw new Error(file.error || `Agent ${agentId} did not write output file`);
  return JSON.parse(file.content);
}

// ── Match analysis: shared runner + renderer ──────────────────────────────────

// Inject a small "enriching" status bar into a results container while LLM runs.
function injectEnrichingShimmer(idPrefix) {
  const el = document.getElementById(`${idPrefix}-results`);
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'mc-enriching';
  d.id = `${idPrefix}-enriching-shimmer`;
  d.innerHTML = '<div class="app-spin" style="width:12px;height:12px;flex-shrink:0"></div> Enriching with AI narrative…';
  el.prepend(d);
}

// Remove the shimmer injected above (called before the full Phase 2 re-render).
function removeEnrichingShimmer(idPrefix) {
  document.getElementById(`${idPrefix}-enriching-shimmer`)?.remove();
}

// Legacy single-call path - kept for callers that don't need incremental render.
// Runs Phase 1 (deterministic) then Phase 2 (LLM enrichment) and returns the merged result.
async function runMatchAnalysis(job) {
  const profile = state.profile || {};
  const partial = computeMatchDeterministic(profile, job);
  return enrichMatchWithLLM(profile, job, partial);
}

// ── Resume tab: left actions pane ─────────────────────────────────────────────
function normalizeGaps(raw) {
  return (raw || []).map(g => typeof g === 'string' ? { skill: g, reason: '' } : g);
}

function buildResumeSkillWorkspace(job) {
  const analysis = buildAnalysisDisplayResult(job) || job?.match_result || {};
  const chosen = new Set((job?.resume_extra_skills || []).map(normalizeSkillToken).filter(Boolean));
  const map = new Map();

  const upsert = (item, priority) => {
    const norm = normalizeSkillToken(item.skill);
    if (!norm) return;
    const prev = map.get(norm);
    if (!prev || priority < prev.priority) {
      map.set(norm, { ...item, norm, selected: chosen.has(norm), priority });
    }
  };

  for (const gap of normalizeGaps(analysis.profile_gaps)) {
    upsert({
      skill: gap.skill,
      reason: truncateText(gap.reason || 'Grounded in your existing experience.', 96),
      source: 'inferred',
      tone: 'inferred',
      allowProfile: true,
    }, 1);
  }

  for (const match of (analysis.partial_matches || [])) {
    upsert({
      skill: match.skill,
      reason: truncateText(match.reason || 'Adjacent family match from your existing work.', 96),
      source: 'adjacent',
      tone: 'adjacent',
      allowProfile: true,
    }, 2);
  }

  for (const skill of (analysis.required_gaps || [])) {
    upsert({
      skill,
      reason: 'In the job post but not in your profile - add it only if you can back it up.',
      source: 'required',
      tone: 'required',
      allowProfile: false,
    }, 3);
  }

  const all = [...map.values()];
  const sections = [
    {
      key: 'inferred',
      title: 'From your experience',
      actions: ['select', 'profile'],
      items: all.filter(item => item.source === 'inferred'),
    },
    {
      key: 'adjacent',
      title: 'Related to your skills',
      actions: ['select'],
      items: all.filter(item => item.source === 'adjacent'),
    },
    {
      key: 'required',
      title: 'Asked for in the job post',
      actions: ['select'],
      items: all.filter(item => item.source === 'required'),
    },
  ].filter(section => section.items.length);

  return {
    analysis,
    sections,
    all,
    selectedCount: all.filter(item => item.selected).length,
    counts: {
      inferred: all.filter(item => item.source === 'inferred').length,
      adjacent: all.filter(item => item.source === 'adjacent').length,
      required: all.filter(item => item.source === 'required').length,
    },
  };
}

function selectedResumeExtraSkills(job) {
  return [...new Set((job?.resume_extra_skills || []).filter(Boolean))];
}


async function addSkillToProfile(skill, silent = false) {
  if (!state.profile) return;
  const p = state.profile;
  if (!p.skill_buckets) p.skill_buckets = [];
  let bucket = p.skill_buckets.find(b => b.category === 'Other');
  if (!bucket) { bucket = { category: 'Other', skills: [] }; p.skill_buckets.push(bucket); }
  if (bucket.skills.includes(skill)) {
    if (!silent) showToast(`"${skill}" is already in your profile.`);
    return;
  }
  bucket.skills.push(skill);
  await bridge.workspaceWrite(PROFILE_PATH, JSON.stringify(p, null, 2));
  if (!silent) showToast(`"${skill}" added to profile.`);
}










// ── Browser health polling (Settings > Browser Account setup session) ───────
let _browserPollInterval = null;

function _startBrowserPoll() {
  _stopBrowserPoll();
  _browserPollInterval = setInterval(async () => {
    const port = state.browser.port;
    if (!port) { _stopBrowserPoll(); return; }
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 3000);
      const r    = await fetch(`http://127.0.0.1:${port}/status`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!r.ok) throw new Error('not ok');
    } catch (_) {
      // Connection refused or timeout → subprocess exited (browser closed).
      _handleBrowserDied();
    }
  }, 5000);
}

function _stopBrowserPoll() {
  if (_browserPollInterval) { clearInterval(_browserPollInterval); _browserPollInterval = null; }
}

function _handleBrowserDied() {
  // Fires when the sign-in browser window is closed (Settings > Job Site Sign-in).
  _stopBrowserPoll();
  if (!state.browser.port) return; // already cleaned up
  const wasSignInSession = state.browser.jobId === '__setup__';
  state.browser.port  = null;
  state.browser.jobId = null;
  bridge.browserClose().catch(() => {});
  loadBrowserProfileStatus().then(renderBrowserProfileSettings);
  if (wasSignInSession && !state.browserProfileExists) {
    showToast('Browser window closed. Verify sign-in before closing it.');
  }
}

// Called by the bridge watcher thread via evaluate_js the instant the
// browser subprocess exits - no polling lag.
window._onBrowserProcessDied = function() { _handleBrowserDied(); };

async function closeApplicationBrowser() {
  _stopBrowserPoll();
  try { await bridge.browserClose(); } catch (_) {}
  state.browser.port  = null;
  state.browser.jobId = null;
}

// ── Browser profile ───────────────────────────────────────────────────────────

async function loadBrowserProfileStatus() {
  try {
    const res = await bridge.browserGetProfileStatus();
    state.browserProfileExists = res?.exists ?? false;
    state.browserProfileEmail  = res?.google_email ?? null;
  } catch (_) {
    state.browserProfileExists = false;
    state.browserProfileEmail  = null;
  }
}

async function setupBrowserProfile() {
  try {
    const result = await bridge.browserSetupProfile();
    if (!result?.ok) {
      showToast(`Could not open browser: ${result?.error || 'unknown'}`);
      return;
    }
    state.browser.port  = result.port;
    state.browser.jobId = '__setup__';
    renderBrowserProfileSettings();   // switches to the "signing in" state
    _startBrowserPoll();
  } catch (e) {
    showToast(`Browser error: ${e.message}`);
  }
}

async function confirmGoogleLogin() {
  const btn = document.getElementById('btn-confirm-signin');
  if (btn) { btn.loading = true; btn.disabled = true; }
  try {
    const result = await bridge.browserCheckGoogleLogin();
    if (!result?.ok) {
      showToast(`Could not verify sign-in: ${result?.error || 'unknown error'}`);
      return;
    }
    if (!result.logged_in) {
      showToast('No signed-in account detected yet - finish signing in, then try again.');
      return;
    }
    // Login confirmed; profile-meta.json is written on the Python side.
    state.browserProfileExists = true;
    state.browserProfileEmail  = result.email || null;
    await closeApplicationBrowser();
    showToast(result.email ? `Signed in as ${result.email}.` : 'Signed in.');
  } catch (e) {
    showToast(`Could not verify sign-in: ${e.message}`);
  } finally {
    if (btn) { btn.loading = false; btn.disabled = false; }
    renderBrowserProfileSettings();
  }
}

async function cancelBrowserSignin() {
  await closeApplicationBrowser();
  renderBrowserProfileSettings();
}

let _resetProfileStep = 0;

function openResetProfileDialog() {
  _resetProfileStep = 1;
  const body = document.getElementById('reset-browser-dialog-body');
  const confirmBtn = document.getElementById('btn-reset-profile-confirm');
  if (body) body.textContent = 'This will delete your saved logins and other information stored in the application window.';
  if (confirmBtn) confirmBtn.textContent = 'Delete';
  document.getElementById('reset-browser-dialog').show();
}

async function doResetBrowserProfile() {
  const confirmBtn = document.getElementById('btn-reset-profile-confirm');
  if (confirmBtn) { confirmBtn.loading = true; confirmBtn.disabled = true; }
  try {
    const res = await bridge.browserResetProfile();
    if (!res?.ok) { showToast(`Reset failed: ${res?.error || 'unknown'}`); return; }
    state.browserProfileExists = false;
    renderBrowserProfileSettings();
    const job = jobById(state.activeJobId);
    showToast('Browser account reset - set it up again to reconnect your logins.');
  } catch (e) {
    showToast(`Reset error: ${e.message}`);
  } finally {
    if (confirmBtn) { confirmBtn.loading = false; confirmBtn.disabled = false; }
    document.getElementById('reset-browser-dialog')?.hide();
  }
}

function renderBrowserProfileSettings() {
  const el = document.getElementById('browser-profile-section-content');
  if (!el) return;
  const signingIn = !!(state.browser.port && state.browser.jobId === '__setup__');

  if (signingIn) {
    el.innerHTML = `
      <p class="settings-hint" style="margin-top:0">Sign in in the browser window that just opened, then confirm here.</p>
      <div class="settings-row" style="align-items:center;gap:8px">
        <sl-button id="btn-confirm-signin" size="small" variant="primary">Verify Google sign-in</sl-button>
        <sl-button id="btn-cancel-signin" size="small">Cancel</sl-button>
      </div>`;
    return;
  }

  if (state.browserProfileExists) {
    const emailLine = state.browserProfileEmail
      ? `<span class="settings-hint" style="margin:0;font-size:12px">${escHtml(state.browserProfileEmail)}</span>`
      : '';
    el.innerHTML = `
      <div class="settings-row" style="align-items:center;flex-wrap:wrap;gap:8px">
        <div class="provider-tag">
          <span class="provider-dot"></span>
          <span>Signed in</span>
        </div>
        ${emailLine}
        <sl-button id="btn-reset-browser-profile" size="small" variant="danger">Sign out</sl-button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="settings-row" style="align-items:center">
        <span class="settings-hint" style="margin:0">Not signed in.</span>
        <sl-button id="btn-setup-browser-profile" size="small" variant="primary">Sign in</sl-button>
      </div>`;
  }
}

// ── Resume Preview tab ────────────────────────────────────────────────────────

// Builds a self-contained print HTML from the resume inner content.
// Opens in a new window that auto-triggers window.print() - zero pip deps.
// Builds a self-contained HTML document for PDF generation via Playwright.
// Full modern CSS (flex, custom properties) works - Chromium renders it.
// The inner content mirrors the screen preview exactly.
function buildExportHTML(draft, p, limits = {}) {
  const inner = renderResumeHTML(draft, p, limits);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; line-height: 1.35; color: #000; background: #fff; }
.rp-page { width: 8.5in; padding: 16px 12px; }
.rp-header { text-align: center; margin-bottom: 7px; }
.rp-name { font-size: 20pt; font-weight: 700; line-height: 1.2; margin-bottom: 3px; }
.rp-contact { font-size: 9.5pt; color: #222; line-height: 1.5; }
.rp-contact-link { color: #222; text-decoration: none; }
.rp-section { margin-bottom: 7px; }
.rp-section-title { font-size: 11pt; font-weight: 700; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 5px; line-height: 1.2; }
.rp-prose { margin: 3px 0 0; font-size: 9.5pt; line-height: 1.4; }
.rp-skill-list { list-style: disc; margin: 3px 0 0 18px; padding: 0; }
.rp-skill-list li { font-size: 10pt; margin: 1px 0; line-height: 1.35; }
.rp-entry { margin-bottom: 5px; }
.rp-entry:last-child { margin-bottom: 0; }
.rp-entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.rp-exp-label { font-size: 9.5pt; flex: 1; min-width: 0; }
.rp-entry-dates { font-size: 10pt; color: #333; white-space: nowrap; flex-shrink: 0; font-style: italic; }
.rp-edu-degree { font-size: 10pt; color: #333; margin-top: 1px; }
.rp-bullets { list-style: disc; margin: 2px 0 0 18px; padding: 0; }
.rp-bullets li { font-size: 10pt; margin: 1px 0; line-height: 1.35; }
.rp-proj-list { list-style: decimal; margin: 3px 0 0 18px; padding: 0; }
.rp-proj-item { margin-bottom: 5px; line-height: 1.35; }
.rp-proj-item:last-child { margin-bottom: 0; }
.rp-proj-name { font-size: 9.5pt; font-weight: 700; color: #000; text-decoration: underline; }
.rp-proj-name-plain { font-size: 9.5pt; font-weight: 700; }
.rp-proj-stack { display: block; font-size: 10pt; font-style: italic; color: #333; margin: 1px 0 2px; }
.rp-pub-list { list-style: decimal; margin: 3px 0 0 18px; padding: 0; }
.rp-pub-item { margin-bottom: 4px; line-height: 1.35; }
.rp-pub-item:last-child { margin-bottom: 0; }
.rp-pub-title { font-size: 9.5pt; font-weight: 700; color: #000; text-decoration: underline; }
.rp-pub-title-plain { font-size: 9.5pt; font-weight: 700; }
.rp-pub-venue { display: block; font-size: 10pt; font-style: italic; color: #333; margin-top: 1px; }
</style>
</head><body>
<div class="rp-page">${inner}</div>
</body></html>`;
}


// ── One-page contract ────────────────────────────────────────────────────────
// The preview scales to fit its pane, which visually hides overflow — a resume
// that spills onto page 2 looked identical to one that fit. PDF export is
// Letter with zero margins, so one page is 8.5x11in = 816x1056 CSS px at 96dpi.
// We measure the real rendered height and report it, because "fits one page" is
// a promise this app makes and nothing was checking it.
const PAGE_H_PX = 1056;

// Two panes render a resume preview (the job Resume tab and the profile Export
// flow), so these helpers are scoped to a root element rather than using IDs —
// duplicate IDs would make getElementById silently target the wrong pane.
function measurePageFit(root = document) {
  const page = root.querySelector('.rp-page');
  if (!page) return null;
  // Read the untransformed height; scaleResumePage may have a transform applied.
  const prevTransform = page.style.transform;
  page.style.transform = '';
  const h = page.offsetHeight;
  page.style.transform = prevTransform;
  return { height: h, limit: PAGE_H_PX, pct: Math.round((h / PAGE_H_PX) * 100), fits: h <= PAGE_H_PX };
}

function renderPageFitBadge(root = document) {
  const el = root.querySelector('.rp-fit-badge');
  const fit = measurePageFit(root);
  if (!el || !fit) return;
  const over = fit.height - fit.limit;
  el.className = `rp-fit-badge ${fit.fits ? 'is-fit' : 'is-over'}`;
  el.textContent = fit.fits
    ? `Fits one page · ${fit.pct}% full`
    : `Over by ${Math.round((over / fit.limit) * 100)}% — will spill to page 2`;
  el.title = `Rendered ${fit.height}px of ${fit.limit}px available on one Letter page`;
}

// Rescale every resume pane that is currently on screen (job Resume tab and/or
// the profile Export flow).
function scaleAllResumePanes() {
  ['#resume-preview-content', '#export-preview-pane'].forEach(sel => {
    const root = document.querySelector(sel);
    if (root && root.offsetParent !== null) { scaleResumePage(root); renderPageFitBadge(root); }
  });
}

function scaleResumePage(root = document) {
  const viewport = root.querySelector('.rp-viewport');
  const wrap     = root.querySelector('.rp-scale-wrap');
  const page     = root.querySelector('.rp-page');
  if (!viewport || !wrap || !page) return;
  page.style.transform = '';
  wrap.style.height    = '';
  wrap.style.width     = '';
  const availW = Math.max(240, viewport.clientWidth - 24);
  const pageW  = 816;
  const pageH  = page.offsetHeight;
  const availH = Math.max(240, viewport.clientHeight - 12);
  const scale  = Math.min(1, availW / pageW, availH / pageH);
  if (scale < 1) {
    // Origin must be top LEFT: the wrapper is sized to the *scaled* box, and
    // scaling from the centre would shift the page's left edge right by
    // (pageW - pageW*scale)/2, pushing it out of the wrapper and clipping it.
    page.style.transform       = `scale(${scale})`;
    page.style.transformOrigin = 'top left';
    wrap.style.height          = Math.ceil(pageH * scale) + 'px';
    wrap.style.width           = Math.ceil(pageW * scale) + 'px';
  }
}

// Per-section limits. Experience earns more bullets than projects because a
// recruiter reads employment first; projects are there to prove range, so they
// stay tight. Callers override these (the export flow tunes them live against
// the one-page budget).
const RESUME_SECTION_ORDER = [
  'summary', 'experience', 'projects', 'skills', 'education',
  'publications', 'certifications',
];

const RESUME_LIMITS = {
  expEntries: 3, expBullets: 4,
  projEntries: 3, projBullets: 2,
  eduEntries: 0,        // 0 = no limit
  certEntries: 0,
  pubEntries: 0,
};

function renderResumeHTML(draft, p, limits = {}) {
  const L       = { ...RESUME_LIMITS, ...limits };
  const cap     = (arr, n) => (n && n > 0 ? (arr || []).slice(0, n) : (arr || []));
  const id      = p.identity || {};
  const contact = p.contact  || {};

  // Contact row: phone | email | links - all facts from profile
  const contactParts = [
    contact.phone ? escHtml(contact.phone) : null,
    contact.email ? escHtml(contact.email) : null,
    ...(contact.links || []).map(l => l.url
      ? `<a class="rp-contact-link" href="${escAttr(normalizeUrl(l.url))}" target="_blank">${escHtml(l.label || l.url)}</a>`
      : null),
  ].filter(Boolean);

  // Section: bold title + bottom border
  const sec = (title, body) => body
    ? `<div class="rp-section"><div class="rp-section-title">${escHtml(title)}</div>${body}</div>`
    : '';

  // Bullet list helper. Callers pass an already-capped array so each section
  // can spend a different share of the page.
  const bul = (arr) => arr?.length
    ? `<ul class="rp-bullets">${arr.map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>`
    : '';

  // ── Skills: group by profile bucket ──────────────────────────────────────
  const draftSkillSet    = new Set(draft.skills || []);
  const allProfileSkills = new Set((p.skill_buckets || []).flatMap(b => b.skills || []));
  const bucketLines = (p.skill_buckets || [])
    .map(b => ({ cat: b.category, skills: (b.skills || []).filter(s => draftSkillSet.has(s)) }))
    .filter(b => b.skills.length);
  const extraSkills = (draft.skills || []).filter(s => !allProfileSkills.has(s));
  if (extraSkills.length) bucketLines.push({ cat: 'Additional', skills: extraSkills });

  const skillsBody = bucketLines.length
    ? `<ul class="rp-skill-list">${
        bucketLines.map(g => `<li><strong>${escHtml(g.cat)}:</strong> ${escHtml(g.skills.join(', '))}</li>`).join('')
      }</ul>`
    : '';

  // ── Experience: facts always from profile, bullets from draft ────────────
  const expBody = cap(draft.experience, L.expEntries).map(exp => {
    const pe      = (p.experience || []).find(e => e.id === exp.id) || {};
    const company = pe.company || '';
    const title   = pe.title   || '';
    const dates   = [pe.start, pe.end].filter(Boolean).join(' – ');
    // `undefined` means "caller didn't specify, use the profile"; an empty array
    // means "the caller deliberately chose none". Collapsing those two is what
    // let de-selected bullets reappear in the export.
    const bullets = cap(exp.bullets != null ? exp.bullets : pe.highlights, L.expBullets);
    return `<div class="rp-entry">
      <div class="rp-entry-head">
        <span class="rp-exp-label"><strong>${escHtml(company)}</strong> - ${escHtml(title)}</span>
        <span class="rp-entry-dates">${escHtml(dates)}</span>
      </div>
      ${bul(bullets)}
    </div>`;
  }).join('');

  // ── Projects: <ol>, facts from profile, bullets from draft ────────────────
  const projItems = cap(draft.projects, L.projEntries).map(pr => {
    const pp      = (p.projects || []).find(proj => proj.id === pr.id) || {};
    const name    = pp.name  || '';
    const url     = pp.url   || '';
    const tech    = (pp.tech || []).join(', ');
    const bullets = cap(pr.bullets != null ? pr.bullets : pp.highlights, L.projBullets);
    const nameEl  = url
      ? `<a class="rp-proj-name" href="${escAttr(normalizeUrl(url))}" target="_blank">${escHtml(name)}</a>`
      : `<span class="rp-proj-name-plain">${escHtml(name)}</span>`;
    return `<li class="rp-proj-item">${nameEl}${tech ? `<span class="rp-proj-stack"><em>Stack: ${escHtml(tech)}</em></span>` : ''}${bul(bullets)}</li>`;
  }).join('');
  const projBody = projItems ? `<ol class="rp-proj-list">${projItems}</ol>` : '';

  // ── Education: entirely from profile ─────────────────────────────────────
  const eduBody = cap(p.education, L.eduEntries).map(ed => {
    const degreeLine = [ed.degree, ed.cgpa ? `CGPA: ${ed.cgpa}` : '']
      .filter(Boolean).map(escHtml).join(' · ');
    return `
    <div class="rp-entry">
      <div class="rp-entry-head">
        <span class="rp-exp-label">${escHtml(ed.institution || '')}</span>
        <span class="rp-entry-dates">${escHtml(ed.year || '')}</span>
      </div>
      <div class="rp-edu-degree">${degreeLine}</div>
    </div>`;
  }).join('');

  // ── Publications: <ol>, entirely from profile ─────────────────────────────
  const pubItems = cap(p.publications, L.pubEntries).map(pub => {
    const titleEl = pub.title
      ? (pub.url
          ? `<a class="rp-pub-title" href="${escAttr(normalizeUrl(pub.url))}" target="_blank">${escHtml(pub.title)}</a>`
          : `<span class="rp-pub-title">${escHtml(pub.title)}</span>`)
      : '';
    const venueEl = (pub.venue || pub.year)
      ? `<span class="rp-pub-venue"><em>${[pub.venue, pub.year].filter(Boolean).map(escHtml).join(' ')}</em></span>`
      : '';
    return `<li class="rp-pub-item">${titleEl}${venueEl}</li>`;
  }).join('');
  const pubBody = pubItems ? `<ol class="rp-pub-list">${pubItems}</ol>` : '';

  // ── Certifications: entirely from profile ─────────────────────────────────
  const certItems = cap(p.certifications, L.certEntries).map(c => {
    const cert = typeof c === 'string' ? { name: c } : (c || {});
    const meta = [cert.issuer, cert.year].filter(Boolean).join(' ');
    return cert.name
      ? `<li class="rp-pub-item"><span class="rp-pub-title">${escHtml(cert.name)}</span>${meta ? `<span class="rp-pub-venue"><em>${escHtml(meta)}</em></span>` : ''}</li>`
      : '';
  }).filter(Boolean).join('');
  const certBody = certItems ? `<ol class="rp-pub-list">${certItems}</ol>` : '';

  // Same undefined-vs-empty rule as bullets: only fall back to the profile
  // summary when the caller left it unspecified.
  const summaryText = draft.summary != null ? draft.summary : (id.summary || '');

  // Sections are independent blocks with no cross-references, so their order is
  // purely presentational and callers can rearrange it. Putting experience above
  // projects (or dropping the summary) matters when a screener only reads the
  // top third of the page.
  const blocks = {
    summary:        summaryText ? sec('Profile', `<p class="rp-prose">${escHtml(summaryText)}</p>`) : '',
    experience:     sec('Work Experience', expBody),
    projects:       sec('Projects', projBody),
    skills:         sec('Skills', skillsBody),
    education:      sec('Education', eduBody),
    publications:   pubBody ? sec('Publications', pubBody) : '',
    certifications: certBody ? sec('Certifications', certBody) : '',
  };
  const order = (L.order && L.order.length) ? L.order : RESUME_SECTION_ORDER;
  // Anything the caller forgot to list still renders, after the ordered ones.
  const ordered = [...order, ...Object.keys(blocks).filter(k => !order.includes(k))];

  return `
    <div class="rp-header">
      <div class="rp-name">${escHtml(id.name || 'Your Name')}</div>
      ${contactParts.length ? `<div class="rp-contact">${contactParts.join(' | ')}</div>` : ''}
    </div>
    ${ordered.map(k => blocks[k] || '').join('')}
  `;
}

// Re-analyze: Phase 1 (instant rescore) renders immediately, Phase 2 (LLM narrative)
// fires async in the background - user sees updated score right away.
async function reAnalyzeJobLegacy() {
  const job = jobById(state.activeJobId);
  if (!job) return;
  if (!state.profile) { const ok = await loadProfile(); if (!ok) { showToast('Profile missing.'); return; } }
  const btn = document.getElementById('btn-reanalyze');
  btn.disabled = true; btn.textContent = 'Analyzing…';

  try {
    if (job.match_result?.match_score != null) {
      job.score_history = job.score_history || [];
      job.score_history.push({ score: job.match_result.match_score, date: new Date().toISOString() });
    }

    // Phase 1 - instant: update score and skill chips
    const partial = computeMatchDeterministic(state.profile, job);
    job.match_result = job.match_result
      ? { ...job.match_result, ...partial,
          apply_readiness: { verdict: partial.apply_readiness.verdict, reason: job.match_result.apply_readiness?.reason || '' } }
      : partial;
    job.match_score = partial.match_score;
    const analysisRun = await persistAnalysisRun(job, {
      trigger: 'reanalyze',
      deterministic: partial,
    });
    await persistJobs();
    renderJobDetailCards(job);
    refreshMountedExportFlow();
    renderJobsDashboard();
    btn.disabled = false; btn.textContent = 'Re-analyze';

    // Phase 2 - async: refresh narrative in the background
    const matchEl = document.getElementById('detail-match-results');
    if (matchEl && !matchEl.classList.contains('hidden')) injectEnrichingShimmer('detail-match');

    enrichMatchWithLLM(state.profile, job, partial).then(async full => {
      const live = jobById(job.id);
      if (!live) return;
      live.match_score  = full.match_score;
      live.match_result = full;
      await persistAnalysisRun(live, {
        runId: analysisRun?.runId,
        createdAt: analysisRun?.createdAt,
        trigger: 'reanalyze',
        deterministic: partial,
        enriched: full,
      });
      await persistJobs();
      removeEnrichingShimmer('detail-match');
      renderJobDetailCards(live);
      refreshMountedExportFlow();
      renderJobsDashboard();
      showToast('Re-analysis complete.');
    }).catch(() => {
      removeEnrichingShimmer('detail-match');
      showToast('Re-scored - narrative enrichment failed.');
    });

  } catch (e) {
    showToast(`Re-analysis failed: ${e.message}`);
    btn.disabled = false; btn.textContent = 'Re-analyze';
  }
}

async function reAnalyzeJob() {
  const job = jobById(state.activeJobId);
  if (!job) return;
  if (!state.profile) {
    const ok = await loadProfile();
    if (!ok) { showToast('Profile missing.'); return; }
  }
  const btn = document.getElementById('btn-reanalyze-analysis');
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing analysis…'; }

  try {
    if (job.match_result?.match_score != null) {
      job.score_history = job.score_history || [];
      job.score_history.push({ score: job.match_result.match_score, date: new Date().toISOString() });
    }

    const partial = computeDisplayedDeterministic(job);
    job.match_result = job.match_result
      ? {
          ...job.match_result,
          ...partial,
          apply_readiness: {
            verdict: partial.apply_readiness.verdict,
            reason: job.match_result.apply_readiness?.reason || partial.apply_readiness?.reason || '',
          },
        }
      : partial;
    job.match_score = partial.match_score;

    const analysisRun = await persistAnalysisRun(job, {
      trigger: 'reanalyze',
      deterministic: partial,
    });
    await persistJobs();
    renderJobDetailCards(job);
    refreshMountedExportFlow();
    renderJobsDashboard();
    if (btn) { btn.disabled = false; btn.textContent = 'Refresh AI Analysis'; }

    const matchEl = document.getElementById('detail-match-results');
    if (matchEl && !matchEl.classList.contains('hidden')) injectEnrichingShimmer('detail-match');

    enrichMatchWithLLM(state.profile, job, partial).then(async full => {
      const live = jobById(job.id);
      if (!live) return;
      live.match_result = full;
      await syncJobDisplayedScore(live, { persist: false });
      await persistAnalysisRun(live, {
        runId: analysisRun?.runId,
        createdAt: analysisRun?.createdAt,
        trigger: 'reanalyze',
        deterministic: partial,
        enriched: full,
      });
      await persistJobs();
      removeEnrichingShimmer('detail-match');
      renderJobDetailCards(live);
      refreshMountedExportFlow();
      renderJobsDashboard();
      showToast('Re-analysis complete.');
    }).catch(() => {
      removeEnrichingShimmer('detail-match');
      showToast('Re-scored - narrative enrichment failed.');
    });
  } catch (e) {
    showToast(`Re-analysis failed: ${e.message}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Refresh AI Analysis'; }
  }
}

function renderJD(text) {
  if (!text) return '<span style="color:var(--dim)">No description provided.</span>';
  const lines = text.split('\n');
  let html = '', inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<div class="jd-spacer"></div>';
      continue;
    }
    const isBullet = /^[-•·*]\s+/.test(line) || /^\d+\.\s+/.test(line);
    const firstThree = line.slice(0, 3);
    const isHeader = line.endsWith(':') && line.length < 80 && !/[a-z]/.test(firstThree);
    if (isBullet) {
      if (!inList) { html += '<ul class="jd-list">'; inList = true; }
      html += `<li>${escHtml(line.replace(/^[-•·*]\s+/, '').replace(/^\d+\.\s+/, ''))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (isHeader) html += `<div class="jd-heading">${escHtml(line)}</div>`;
      else html += `<p class="jd-para">${escHtml(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function scoreColorFor(n) {
  if (n >= 75) return 'var(--green)';
  if (n >= 50) return 'var(--accent)';
  return 'var(--red)';
}

function matchChip(text, color) {
  return `<span class="chip match-chip" style="--chip-color:${color}">${escHtml(String(text))}</span>`;
}

function matchChips(items, color) {
  if (!items?.length) return '<span class="match-none">None identified</span>';
  return items.map(s => matchChip(s, color)).join('');
}

function renderMatchInto(idPrefix, m, label) {
  const score = Math.max(0, Math.min(100, m.match_score || 0));
  const col   = scoreColorFor(score);

  const listHtml = (arr, dotColor) => (arr || []).length
    ? arr.map(s => `<li class="match-list-item"><span class="match-dot" style="background:${dotColor}"></span>${escHtml(String(s))}</li>`).join('')
    : `<li class="match-list-item match-none">None listed</li>`;

  const partials = (m.partial_matches || []);
  const partialHtml = partials.length
    ? partials.map(pm => `
        <div class="partial-match-row">
          ${matchChip(pm.skill || '', 'var(--amber)')}
          <span class="partial-match-reason">${escHtml(pm.reason || pm.bucket || '')}</span>
        </div>`).join('')
    : '';

  const projectsHtml = (m.relevant_projects || []).length
    ? m.relevant_projects.map(pr => `
        <div class="match-project-row">
          <div class="match-project-name">${escHtml(pr.name || '')}</div>
          <div class="match-project-reason">${escHtml(pr.reason || '')}</div>
          ${(pr.talking_points || []).length ? `<ul class="match-project-bullets">${
            pr.talking_points.map(tp => `<li>${escHtml(tp)}</li>`).join('')
          }</ul>` : ''}
        </div>`).join('')
    : '<span class="match-none">None identified</span>';

  document.getElementById(`${idPrefix}-empty`).classList.add('hidden');
  const el = document.getElementById(`${idPrefix}-results`);
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="match-score-row">
      <div class="match-score-ring" style="--score:${score};--c:${col}">
        <span class="match-score-num">${score}</span>
      </div>
      <div class="match-score-meta">
        ${label ? `<div class="match-role-title">${escHtml(label)}</div>` : ''}
        <p class="match-summary">${escHtml(m.summary || '')}</p>
      </div>
    </div>
    ${m.application_strategy ? `
    <div class="match-strategy">
      <span class="match-strategy-icon">&#9654;</span>
      ${escHtml(m.application_strategy)}
    </div>` : ''}
    <div class="match-skills-grid">
      <div class="match-section">
        <div class="match-section-label match-label-green">Matched</div>
        <div class="chips">${matchChips(m.skills_matched, 'var(--green)')}</div>
      </div>
      ${partials.length ? `
      <div class="match-section">
        <div class="match-section-label match-label-amber">Partial</div>
        <div class="partial-matches">${partialHtml}</div>
      </div>` : ''}
      ${(m.required_gaps || []).length ? `
      <div class="match-section">
        <div class="match-section-label match-label-red">Required gaps</div>
        <div class="chips">${matchChips(m.required_gaps, 'var(--red)')}</div>
      </div>` : ''}
      ${(m.nice_to_have_gaps || []).length ? `
      <div class="match-section">
        <div class="match-section-label match-label-dim">Nice-to-have gaps</div>
        <div class="chips">${matchChips(m.nice_to_have_gaps, 'var(--dim)')}</div>
      </div>` : ''}
    </div>
    ${(m.relevant_projects || []).length ? `
    <div class="match-section">
      <div class="match-section-label">Relevant projects &amp; talking points</div>
      <div class="match-projects">${projectsHtml}</div>
    </div>` : ''}
    ${m.relevant_experience ? `
    <div class="match-section">
      <div class="match-section-label">Experience fit</div>
      <p class="match-prose">${escHtml(m.relevant_experience)}</p>
    </div>` : ''}
    ${(m.green_flags || []).length ? `
    <div class="match-section">
      <div class="match-section-label match-label-green">Strengths</div>
      <ul class="match-list">${listHtml(m.green_flags, 'var(--green)')}</ul>
    </div>` : ''}
    ${(m.focus_areas || []).length ? `
    <div class="match-section">
      <div class="match-section-label">To close the gap</div>
      <ul class="match-list">${listHtml(m.focus_areas, 'var(--accent)')}</ul>
    </div>` : ''}
  `;
}

// ── Settings: providers + model ──────────────────────────────────────────────
function openSettings() {
  document.getElementById('settings-dialog').show();
  document.getElementById('auto-analyze-toggle').checked = state.autoAnalyzePaste;
  loadProviders();
  loadBrowserProfileStatus().then(renderBrowserProfileSettings);
}

async function loadProviders() {
  try {
    const data = await bridge.getProviders();
    state.providers.featured = data.featured || [];
    state.providers.connected = data.connected || [];
    renderConnected();
    populateProviderSelect();
    populateModelProviderSelect();
  } catch (e) {
    setAuthStatus('err', 'Failed to load providers');
  }
}

function renderConnected() {
  const el = document.getElementById('connected-list');
  // OpenCode Zen is always connected and needs no key - don't list it as removable.
  const connected = state.providers.connected.filter(id => id !== 'opencode');
  if (!connected.length) {
    el.innerHTML = '<span class="settings-hint">No keyed providers connected yet.</span>';
    return;
  }
  el.innerHTML = connected.map(id => {
    const p = state.providers.featured.find(x => x.id === id);
    return `<div class="provider-tag">
      <span class="provider-dot"></span>
      <span>${escHtml(p ? p.name : id)}</span>
      <button class="provider-tag-remove" data-pid="${escAttr(id)}" title="Disconnect">&times;</button>
    </div>`;
  }).join('');
}

function populateProviderSelect() {
  const sel = document.getElementById('provider-select');
  // Providers that take an API key (exclude the keyless OpenCode Zen).
  const keyed = state.providers.featured.filter(p => p.id !== 'opencode');
  sel.innerHTML = keyed.map(p => {
    const on = state.providers.connected.includes(p.id);
    return `<sl-option value="${escAttr(p.id)}">${escHtml(p.name)}${on ? ' ✓' : ''}</sl-option>`;
  }).join('');
}

function populateModelProviderSelect() {
  const sel = document.getElementById('model-provider');
  // Any connected provider can supply a model - including free OpenCode Zen.
  const usable = state.providers.featured.filter(p => state.providers.connected.includes(p.id));
  sel.innerHTML = '<sl-option value="">- provider -</sl-option>' +
    usable.map(p => `<sl-option value="${escAttr(p.id)}">${escHtml(p.name)}</sl-option>`).join('');
  const modelSel = document.getElementById('model-select');
  modelSel.innerHTML = '<sl-option value="">- pick a provider -</sl-option>';
  modelSel.disabled = true;
  document.getElementById('btn-set-model').disabled = true;
}

function updateModelSelectForProvider(pid) {
  const modelSel = document.getElementById('model-select');
  const btn = document.getElementById('btn-set-model');
  if (!pid) {
    modelSel.innerHTML = '<sl-option value="">- pick a provider -</sl-option>';
    modelSel.disabled = true; btn.disabled = true; return;
  }
  const p = state.providers.featured.find(x => x.id === pid);
  const models = (p && p.models) || [];
  modelSel.innerHTML = '<sl-option value="">- model -</sl-option>' +
    models.map(m => `<sl-option value="${escAttr(m.id)}">${escHtml(m.name || m.id)}</sl-option>`).join('');
  modelSel.disabled = false;
  btn.disabled = true;
}

async function saveKey() {
  const pid = document.getElementById('provider-select').value;
  const input = document.getElementById('api-key');
  const key = input.value.trim();
  if (!pid) { setAuthStatus('err', 'Pick a provider first.'); return; }
  if (!key) { setAuthStatus('err', 'Enter an API key.'); return; }

  const btn = document.getElementById('btn-save-key');
  btn.loading = true;
  setAuthStatus('info', 'Saving key and restarting the engine…');
  try {
    const res = await bridge.saveProviderKey(pid, key);
    if (!res.ok) throw new Error(res.error || 'Unknown error');
    state.port = res.port;          // server restarted on a new port
    input.value = '';
    setAuthStatus('ok', 'Connected.');
    await loadProviders();
  } catch (e) {
    setAuthStatus('err', e.message);
  } finally {
    btn.loading = false;
  }
}

async function removeKey(pid) {
  setAuthStatus('info', 'Removing credentials and restarting…');
  try {
    const res = await bridge.removeProviderKey(pid);
    if (!res.ok) throw new Error(res.error);
    state.port = res.port;
    setAuthStatus('ok', 'Disconnected.');
    await loadProviders();
  } catch (e) {
    setAuthStatus('err', e.message);
  }
}

async function setModel() {
  const pid = document.getElementById('model-provider').value;
  const mid = document.getElementById('model-select').value;
  if (!pid || !mid) { setModelStatus('err', 'Pick both provider and model.'); return; }
  const btn = document.getElementById('btn-set-model');
  btn.loading = true;
  setModelStatus('info', 'Writing config and restarting…');
  try {
    const res = await bridge.setDefaultModel(pid, mid);
    if (!res.ok) throw new Error(res.error);
    state.port = res.port;
    state.defaultModel = res.model;
    setModelStatus('ok', `Model set: ${res.model}`);
    updateModelBadge();
  } catch (e) {
    setModelStatus('err', e.message);
  } finally {
    btn.loading = false;
  }
}

function setStatusText(id, type, msg) {
  const el = document.getElementById(id);
  el.className = `status-text${type ? ` status-${type}` : ''}`;
  el.textContent = msg;
}
const setAuthStatus  = (type, msg) => setStatusText('auth-status', type, msg);
const setModelStatus = (type, msg) => setStatusText('model-status', type, msg);

function updateModelBadge() {
  const el = document.getElementById('model-badge-text');
  const cur = document.getElementById('current-model');
  const label = state.defaultModel ? state.defaultModel.split('/').pop() : '-';
  if (el) el.textContent = label;
  if (cur) cur.textContent = state.defaultModel || '-';
}

// ── View switching ───────────────────────────────────────────────────────────
function switchView(view) {
  if (view !== 'jobs' && state.browser.port) closeApplicationBrowser();
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === `view-${view}`));
  syncChrome(view);
  if (view === 'jobs') {
    loadJobs().then(async () => {
      if (!state.profile) await loadProfile().catch(() => false);
      if (state.profile) {
        for (const job of state.jobs) {
          if ((job.analysis_ignored_skills || []).length && job.match_result) {
            await syncJobDisplayedScore(job, { persist: false });
          }
        }
      }
      renderJobsDashboard();
      showJobsSubview('dashboard');
    });
  }
  if (view === 'profile') {
    if (state.profile && hasProfileData(state.profile)) renderProfileSections();
    showProfileSubview('main');
  }
  if (view === 'scanner') {
    loadScannerState();
  }
}

// ── Scanner ───────────────────────────────────────────────────────────────────
async function loadScannerState() {
  try {
    const [settings, feed] = await Promise.all([bridge.scannerGetSettings(), bridge.scannerGetFeed()]);
    state.scanner.settings = settings;
    state.scanner.feed = feed;
  } catch (_) {
    showToast('Failed to load Scanner data');
  }
  renderScannerSettings();
  renderScannerFeed();
}

// LinkedIn's own enumerated facet values (its search URL's f_WT/f_JT params) -
// reused as-is rather than free text, so a search can't ask for something
// LinkedIn's backend has no way to filter on. Keywords/location stay free
// text since those genuinely are open-ended.
const WORKPLACE_TYPE_OPTIONS = [
  { value: 'onsite', label: 'On-site' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
];
const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'internship', label: 'Internship' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'other', label: 'Other' },
];
// Single-select (unlike workplace/employment type, which allow several at
// once) - LinkedIn's own "Date posted" facet only ever applies one value.
const DATE_POSTED_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'day', label: 'Past 24 hours' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
];

function scannerChipGroup(index, group, options, selected) {
  return `<div class="scanner-chip-group">${options.map(o => `
    <button type="button" class="scanner-chip ${selected.includes(o.value) ? 'is-on' : ''}"
      data-index="${index}" data-group="${group}" data-value="${o.value}">${escHtml(o.label)}</button>
  `).join('')}</div>`;
}

function scannerSingleChipGroup(index, group, options, selectedValue) {
  return `<div class="scanner-chip-group">${options.map(o => `
    <button type="button" class="scanner-chip ${selectedValue === o.value ? 'is-on' : ''}"
      data-index="${index}" data-group="${group}" data-value="${o.value}" data-single="1">${escHtml(o.label)}</button>
  `).join('')}</div>`;
}

function renderScannerSettings() {
  const checkbox = document.getElementById('scanner-include-recommended');
  if (checkbox) checkbox.checked = !!state.scanner.settings.include_recommended;

  const container = document.getElementById('scanner-searches');
  if (!container) return;
  const searches = state.scanner.settings.searches || [];
  container.innerHTML = searches.map((s, i) => `
    <div class="scanner-search-row" data-index="${i}">
      <div class="scanner-search-inputs">
        <input class="scanner-search-input" data-field="keywords" placeholder="Keywords (e.g. Backend Engineer)" value="${escAttr(s.keywords || '')}"/>
        <input class="scanner-search-input" data-field="location" placeholder="Location (e.g. Bengaluru) - workplace type is set separately below" value="${escAttr(s.location || '')}"/>
        <button class="scanner-search-remove ps-btn-icon" title="Remove search">×</button>
      </div>
      <div class="scanner-chip-row">
        <span class="scanner-chip-label">Workplace type</span>
        ${scannerChipGroup(i, 'workplace_types', WORKPLACE_TYPE_OPTIONS, s.workplace_types || [])}
      </div>
      <div class="scanner-chip-row">
        <span class="scanner-chip-label">Employment type</span>
        ${scannerChipGroup(i, 'employment_types', EMPLOYMENT_TYPE_OPTIONS, s.employment_types || [])}
      </div>
      <div class="scanner-chip-row">
        <span class="scanner-chip-label">Date posted</span>
        ${scannerSingleChipGroup(i, 'date_posted', DATE_POSTED_OPTIONS, s.date_posted || '')}
      </div>
    </div>`).join('') || '<div class="scanner-searches-empty">No configured searches yet - add one, or rely on the recommended feed alone.</div>';
}

function renderScannerFeed() {
  const container = document.getElementById('scanner-feed');
  if (!container) return;
  const feed = (state.scanner.feed || []).filter(j => !j.dismissed);

  if (!feed.length) {
    container.innerHTML = '<div class="view-placeholder">No jobs scanned yet. Click "Scan now" to fetch from your logged-in LinkedIn session.</div>';
    return;
  }

  container.innerHTML = feed.map(j => {
    const key = j.job_id || j.link || '';
    const sourceLabel = j.source === 'recommended' ? 'Recommended' : (j.source_label || 'Search');
    return `
    <div class="scanner-card" data-key="${escAttr(key)}">
      <div class="scanner-card-main">
        <div class="scanner-card-title">${escHtml(j.title || 'Untitled role')}</div>
        <div class="scanner-card-meta">${escHtml(j.company || '')}${j.location ? ' · ' + escHtml(j.location) : ''}</div>
        <div class="scanner-card-tags">
          <span class="scanner-tag">${escHtml(sourceLabel)}</span>
          ${j.posted_text ? `<span class="scanner-tag scanner-tag-dim">${escHtml(j.reposted ? 'Reposted ' + j.posted_text : j.posted_text)}</span>` : ''}
          ${j.applicant_text ? `<span class="scanner-tag scanner-tag-dim">${escHtml(j.applicant_text)}</span>` : ''}
          ${j.easy_apply ? '<span class="scanner-tag scanner-tag-dim">Easy Apply</span>' : ''}
          ${j.linkedin_promoted ? '<span class="scanner-tag scanner-tag-promoted">Promoted</span>' : ''}
          ${j.actively_recruiting ? '<span class="scanner-tag scanner-tag-dim">Actively recruiting</span>' : ''}
          ${j.promoted ? '<span class="scanner-tag scanner-tag-added">Added to Jobs</span>' : ''}
        </div>
      </div>
      <div class="scanner-card-actions">
        ${j.link ? `<button class="scanner-card-link" data-url="${escAttr(j.link)}" title="Open on LinkedIn">Open</button>` : ''}
        <button class="scanner-card-add" data-key="${escAttr(key)}" ${j.promoted ? 'disabled' : ''}>${j.promoted ? 'Added' : 'Add to Jobs'}</button>
        <button class="scanner-card-dismiss" data-key="${escAttr(key)}" title="Dismiss">×</button>
      </div>
    </div>`;
  }).join('');
}

async function persistScannerSettingsFromForm() {
  // Chip selections live only in state.scanner.settings (toggled in place by
  // the chip click handler) - only keywords/location need reading from the
  // DOM here since those are plain inputs.
  const rows = (state.scanner.settings.searches || []).map((s, i) => {
    const row = document.querySelector(`.scanner-search-row[data-index="${i}"]`);
    return {
      keywords: row ? row.querySelector('[data-field="keywords"]').value.trim() : (s.keywords || ''),
      location: row ? row.querySelector('[data-field="location"]').value.trim() : (s.location || ''),
      workplace_types: s.workplace_types || [],
      employment_types: s.employment_types || [],
      date_posted: s.date_posted || '',
    };
  });
  const includeRecommended = document.getElementById('scanner-include-recommended').checked;
  const settings = { include_recommended: includeRecommended, searches: rows };
  state.scanner.settings = await bridge.scannerSaveSettings(settings);
}

async function runScannerScan() {
  if (state.scanner.running) return;
  const btn = document.getElementById('btn-scanner-run');
  const status = document.getElementById('scanner-status');
  state.scanner.running = true;
  if (btn) { btn.loading = true; btn.disabled = true; }
  if (status) status.textContent = 'Scanning your LinkedIn session…';

  try {
    const result = await bridge.scannerRun();
    if (!result.ok) {
      if (result.error === 'linkedin_login_required') {
        showToast('LinkedIn login required - open the application browser (Settings) and log in, then scan again.');
        if (status) status.textContent = 'Login required - see Settings > Browser Account.';
      } else {
        showToast('Scan failed: ' + (result.error || 'unknown error'));
        if (status) status.textContent = 'Scan failed.';
      }
      return;
    }
    state.scanner.feed = result.feed;
    renderScannerFeed();
    if (status) status.textContent = `Found ${result.found} job${result.found === 1 ? '' : 's'} - ${state.scanner.feed.length} total in feed.`;
    showToast(`Scan complete - ${result.found} job(s) found`);
  } catch (e) {
    showToast('Scan failed: ' + e);
    if (status) status.textContent = 'Scan failed.';
  } finally {
    state.scanner.running = false;
    if (btn) { btn.loading = false; btn.disabled = false; }
  }
}

async function addScannerJobToJobs(key) {
  const found = (state.scanner.feed || []).find(j => (j.job_id || j.link) === key);
  if (!found) return;
  // Reload from disk first - state.jobs is only populated by visiting the Jobs
  // tab, and this action can run without that ever having happened. Skipping
  // this reload would persist a truncated in-memory list over the real file.
  await loadJobs();
  const job = {
    id: Date.now().toString(), title: found.title || 'Untitled Role',
    company: found.company || '', link: found.link || '', description: '',
    status: 'saved', match_score: null, match_result: null, score_history: [],
    resume_draft: null, resume_extra_skills: [],
    created_at: new Date().toISOString(),
  };
  state.jobs.unshift(job);
  await persistJobs();
  state.scanner.feed = await bridge.scannerPromote(key);
  renderScannerFeed();
  showToast('Added to Jobs - open it to paste the full description and analyze.');
}

async function dismissScannerJob(key) {
  state.scanner.feed = await bridge.scannerDismiss(key);
  renderScannerFeed();
}

// ── Utils ──────────────────────────────────────────────────────────────────────
function syncChrome(view) {
  document.querySelectorAll('.nav-item[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) { return escHtml(s); }

// URLs typed without a scheme (e.g. "github.com/x") are valid to display as
// text but useless as an href - the browser resolves them relative to the
// current page, and Playwright's PDF export has no page to resolve them
// against at all. Give anything schemeless an "https://" so the link actually
// goes somewhere, in both the live preview and the exported PDF.
function normalizeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return s;
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

// ── Wiring ──────────────────────────────────────────────────────────────────────
function wire() {
  const fileInput = document.getElementById('file-input');
  const dz = document.getElementById('dropzone');

  fileInput.addEventListener('change', e => handleFiles(e.target.files));

  ['dragenter', 'dragover'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

  // Profile tab - ingest
  document.getElementById('btn-add-info').addEventListener('click', () => showProfileSubview('ingest'));
  document.getElementById('btn-back-from-ingest').addEventListener('click', () => showProfileSubview('main'));
  document.getElementById('btn-export-profile')?.addEventListener('click', () => showProfileExport());
  document.getElementById('btn-back-from-export')?.addEventListener('click', leaveExportFlow);


  // ── Export picker interactions ────────────────────────────────────────────
  // The component's markup is created at mount time, so these must be delegated
  // from the static mount hosts - binding to #export-pick-pane at startup left
  // every handler attached to an element that gets replaced.
  const exportHosts = EXPORT_MOUNTS
    .map(sel => document.querySelector(sel)).filter(Boolean);
  const pick = { addEventListener: (type, fn) => exportHosts.forEach(h => h.addEventListener(type, fn)) };
  pick?.addEventListener('change', e => {
    const sec = e.target.closest('[data-export-section]');
    if (sec) {
      exportState.include[sec.dataset.exportSection] = sec.checked;
      renderExportPicker(); renderExportPreview();
      return;
    }
    const entry = e.target.closest('[data-export-entry]');
    if (entry) {
      exportState.entries[entry.dataset.exportEntry] = entry.checked;
      renderExportPicker(); renderExportPreview();
      return;
    }
    const bullet = e.target.closest('[data-export-bullet]');
    if (bullet) {
      const [kind, id, refStr] = bullet.dataset.exportBullet.split(':');
      const k = entryKey(kind, id);
      const ref = parseExportBulletRef(refStr);
      const set = exportState.bullets[k] = exportState.bullets[k] || new Set();
      if (bullet.checked) set.add(ref); else set.delete(ref);
      // Patch in place rather than re-rendering the picker: a full rebuild on
      // every tick would lose scroll position and detach the checkbox the user
      // is still interacting with.
      bullet.closest('.export-bullet')?.classList.toggle('is-on', bullet.checked);
      const countEl = bullet.closest('.export-entry')?.querySelector('.export-entry-count');
      if (countEl) countEl.textContent = `${set.size}/${countEl.textContent.split('/')[1]}`;
      renderExportPreview();
    }
  });
  pick?.addEventListener('input', e => {
    const custom = e.target.closest('[data-export-custom-bullet]');
    if (custom) {
      const [kind, id, ref] = custom.dataset.exportCustomBullet.split(':');
      const k = entryKey(kind, id);
      exportState.custom[k] = exportState.custom[k] || {};
      exportState.custom[k][ref] = custom.value;
      // Avoid a full re-render here too - it would steal focus mid-keystroke.
      renderExportPreview();
    }
  });
  pick?.addEventListener('click', e => {
    const skillBadge = e.target.closest('[data-export-skill]');
    if (skillBadge) {
      const skill = skillBadge.dataset.exportSkill;
      if (exportState.extraSkills.has(skill)) exportState.extraSkills.delete(skill);
      else exportState.extraSkills.add(skill);
      // Remember the choice on the job so it survives leaving the tab.
      const job = exportState.jobId ? jobById(exportState.jobId) : null;
      if (job) { job.resume_extra_skills = [...exportState.extraSkills]; persistJobs(); }
      renderExportPicker(); renderExportPreview();
      return;
    }
    const move = e.target.closest('[data-export-move]');
    if (move) {
      const [dir, key] = move.dataset.exportMove.split(':');
      const arr = exportState.order.length ? [...exportState.order] : [...RESUME_SECTION_ORDER];
      const i = arr.indexOf(key);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < arr.length) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        exportState.order = arr;
        renderExportPicker(); renderExportPreview();
      }
      return;
    }
    const entryMove = e.target.closest('[data-export-entry-move]');
    if (entryMove) {
      const [dir, kind, id] = entryMove.dataset.exportEntryMove.split(':');
      const p = state.profile || {};
      const list = kind === 'exp' ? (p.experience || []) : (p.projects || []);
      const ids = list.map(x => String(x.id));
      const arr = entryOrderFor(kind, ids);
      const i = arr.indexOf(id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < arr.length) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        exportState.entryOrder[kind] = arr;
        renderExportPicker(); renderExportPreview();
      }
      return;
    }
    const bulletMove = e.target.closest('[data-export-bullet-move]');
    if (bulletMove) {
      const [dir, kind, id, refStr] = bulletMove.dataset.exportBulletMove.split(':');
      const k = entryKey(kind, id);
      const ref = parseExportBulletRef(refStr);
      const arr = exportState.bulletOrder[k] || [];
      const i = arr.indexOf(ref);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < arr.length) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        exportState.bulletOrder[k] = arr;
        renderExportPicker(); renderExportPreview();
      }
      return;
    }
    const addBullet = e.target.closest('[data-export-add-bullet]');
    if (addBullet) {
      const k = addBullet.dataset.exportAddBullet;
      const [kind, id] = [k.split(':')[0], k.slice(k.indexOf(':') + 1)];
      const ref = `c${++exportState.customSeq}`;
      exportState.custom[k] = exportState.custom[k] || {};
      exportState.custom[k][ref] = '';
      (exportState.bullets[k] = exportState.bullets[k] || new Set()).add(ref);
      renderExportPicker(); renderExportPreview();
      document.querySelector(`[data-export-custom-bullet="${kind}:${id}:${ref}"]`)?.focus();
      return;
    }
    const removeBullet = e.target.closest('[data-export-remove-bullet]');
    if (removeBullet) {
      const [kind, id, ref] = removeBullet.dataset.exportRemoveBullet.split(':');
      const k = entryKey(kind, id);
      delete exportState.custom[k]?.[ref];
      exportState.bullets[k]?.delete(ref);
      renderExportPicker(); renderExportPreview();
      return;
    }
    if (e.target.closest('[data-export-summary-reset]')) {
      exportState.summaryText = null;
      exportState.guiding = null;
      renderExportPicker(); renderExportPreview();
      showToast('Original summary restored.');
      return;
    }
    if (e.target.closest('#btn-export-profile-pdf')) { exportProfileResumePDF(); return; }
    if (e.target.closest('#btn-choose-export-dir')) { chooseExportDir(); return; }
    if (e.target.closest('#btn-clear-export-dir')) {
      setSavedExportDir(''); renderExportDestination(); showToast('Back to Downloads.'); return;
    }
    const guide = e.target.closest('[data-export-guide]');
    if (guide) {
      const key = guide.dataset.exportGuide;
      exportState.guiding = exportState.guiding === key ? null : key;
      renderExportPicker();
      document.querySelector('.export-guide-input')?.focus();
      return;
    }
    const run = e.target.closest('[data-export-guide-run]');
    if (run) { runGuidedRewrite(run.dataset.exportGuideRun); return; }
    if (e.target.closest('[data-export-guide-cancel]')) {
      exportState.guiding = null; renderExportPicker(); return;
    }
    const reset = e.target.closest('[data-export-guide-reset]');
    if (reset) {
      delete exportState.rewritten[reset.dataset.exportGuideReset];
      delete exportState.rewriteLog[reset.dataset.exportGuideReset];
      exportState.guiding = null;
      renderExportPicker(); renderExportPreview();
      showToast('Original bullet restored.');
    }
  });
  pick?.addEventListener('keydown', e => {
    if (e.target.closest('.export-guide-input') && e.key === 'Enter') {
      e.preventDefault();
      const box = e.target.closest('.export-guide-box');
      box?.querySelector('[data-export-guide-run]')?.click();
    }
  });
  document.getElementById('paste-text').addEventListener('input', updateGenerateEnabled);
  document.getElementById('btn-generate').addEventListener('click', extractAndMerge);
  document.getElementById('doc-list').addEventListener('click', async e => {
    const del = e.target.closest('.doc-del');
    if (del) { await bridge.workspaceDelete(del.dataset.path); await refreshDocs(); }
  });

  // Profile tab - section edit/save/cancel (event delegation)
  const ps = document.getElementById('profile-sections');
  ps.addEventListener('click', e => {
    // AI + headline controls first — some share styling classes with the
    // generic section buttons below and must not fall through to them.
    const aiWrite = e.target.closest('[data-ai-write]');
    if (aiWrite) {
      const [kind, idx] = aiWrite.dataset.aiWrite.split(':');
      writeWithAI(kind, idx);
      return;
    }
    const aiApply = e.target.closest('[data-ai-apply]');
    if (aiApply) {
      const [kind, idx] = aiApply.dataset.aiApply.split(':');
      applyAIDraft(kind, idx);
      return;
    }
    const aiRerun = e.target.closest('[data-ai-rerun]');
    if (aiRerun) {
      const [kind, idx] = aiRerun.dataset.aiRerun.split(':');
      writeWithAI(kind, idx);
      return;
    }
    if (e.target.closest('.ai-draft-discard')) {
      e.target.closest('.ai-draft-panel')?.classList.add('hidden');
      _aiDraft = null;
      return;
    }
    if (e.target.closest('#btn-headline-generate'))     { generateHeadlines(); return; }
    if (e.target.closest('#btn-headline-save-current')) { saveCurrentHeadlineAsVariant(); return; }
    if (e.target.closest('#btn-headline-manage'))       { editSection('identity'); return; }
    const hvUse = e.target.closest('[data-hv-use]');
    if (hvUse) { useHeadlineVariant(Number(hvUse.dataset.hvUse)); return; }
    const hvRemove = e.target.closest('[data-hv-remove]');
    if (hvRemove) { removeHeadlineVariant(Number(hvRemove.dataset.hvRemove)); return; }
    const jump = e.target.closest('[data-jump-section]');
    if (jump) {
      const target = jump.dataset.jumpSection;
      document.querySelector(`.profile-section[data-section="${target}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      editSection(target);
      return;
    }

    if (e.target.closest('.ps-edit-btn'))   { editSection(e.target.closest('[data-section]').dataset.section); return; }
    if (e.target.closest('.ps-save-btn'))   { saveSection(e.target.closest('[data-section]').dataset.section); return; }
    if (e.target.closest('.ps-cancel-btn')) { cancelSection(e.target.closest('[data-section]').dataset.section); return; }
    if (e.target.closest('.skill-chip-remove')) { e.target.closest('.skill-chip-tag').remove(); return; }
    if (e.target.closest('.tag-chip-remove'))   { e.target.closest('.tag-chip-tag').remove(); return; }
    if (e.target.closest('.ps-remove-bucket'))  { e.target.closest('.skill-bucket-edit').remove(); return; }
    if (e.target.closest('.ps-remove-link'))    { e.target.closest('.link-entry').remove(); return; }
    if (e.target.closest('.ps-remove-exp'))     { e.target.closest('.exp-item-edit').remove(); return; }
    if (e.target.closest('.ps-remove-proj'))    { e.target.closest('.proj-item-edit').remove(); return; }
    if (e.target.closest('.ps-remove-highlight')) { e.target.closest('.highlight-row').remove(); return; }
    if (e.target.closest('.ps-remove-edu'))  { e.target.closest('.ps-list-edit-row').remove(); return; }
    if (e.target.closest('.ps-remove-cert')) { e.target.closest('.ps-list-edit-row').remove(); return; }
    if (e.target.closest('.ps-remove-pub'))  { e.target.closest('.ps-list-edit-row').remove(); return; }
    if (e.target.closest('.ps-add-bucket'))  { addNewBucket(); return; }
    if (e.target.closest('.ps-add-link'))    { addLink(); return; }
    if (e.target.closest('.ps-add-exp'))     { addNewExpItem(); return; }
    if (e.target.closest('.ps-add-proj'))    { addNewProjItem(); return; }
    if (e.target.closest('.ps-add-highlight')) {
      const btn = e.target.closest('.ps-add-highlight');
      const editor = btn.previousElementSibling;
      if (editor?.classList.contains('highlights-editor')) addHighlightRow(editor);
      return;
    }
    if (e.target.closest('.ps-add-edu'))  { addSimpleEditRow('edu-editor',  [{key:'degree',placeholder:'Degree'},{key:'institution',placeholder:'Institution'},{key:'year',placeholder:'Year'},{key:'cgpa',placeholder:'CGPA / GPA (optional)'}]); return; }
    if (e.target.closest('.ps-add-cert')) { addSimpleEditRow('cert-editor', [{key:'name',placeholder:'Certification name'},{key:'issuer',placeholder:'Issuer'},{key:'year',placeholder:'Year'}]); return; }
    if (e.target.closest('.ps-add-pub'))  { addSimpleEditRow('pub-editor',  [{key:'title',placeholder:'Title'},{key:'venue',placeholder:'Venue'},{key:'year',placeholder:'Year'},{key:'url',placeholder:'URL'}]); return; }
  });

  // Enter key: add skill chip or tag chip
  ps.addEventListener('keydown', e => {
    const skillInput = e.target.closest('.skill-add-input');
    if (skillInput && e.key === 'Enter') {
      e.preventDefault();
      const skill = skillInput.value.trim();
      if (skill) { addSkillChip(skillInput.closest('.skill-chips-edit'), skill); skillInput.value = ''; }
      return;
    }
    const tagInput = e.target.closest('.tag-add-input');
    if (tagInput && e.key === 'Enter') {
      e.preventDefault();
      const tag = tagInput.value.trim();
      if (tag) { addTagChip(tagInput.closest('.tag-chips-edit'), tag); tagInput.value = ''; }
    }
  });

  // Sidebar: collapse toggle
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('btn-sidebar-collapse');
  const COLLAPSED_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg>`;
  const EXPANDED_SVG  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg>`;
  function setSidebarCollapsed(on) {
    sidebar.classList.toggle('collapsed', on);
    if (on) {
      document.documentElement.style.setProperty('--sidebar-w', '72px');
    } else {
      const restored = parseInt(localStorage.getItem('sidebar-w') || '252', 10);
      document.documentElement.style.setProperty('--sidebar-w', `${Math.max(220, restored)}px`);
    }
    collapseBtn.innerHTML = on ? COLLAPSED_SVG : EXPANDED_SVG;
    collapseBtn.title = on ? 'Expand sidebar' : 'Collapse sidebar';
    localStorage.setItem('sidebar-collapsed', on ? '1' : '');
  }
  collapseBtn.addEventListener('click', () => setSidebarCollapsed(!sidebar.classList.contains('collapsed')));
  if (localStorage.getItem('sidebar-collapsed')) setSidebarCollapsed(true);

  // Sidebar: drag-to-resize
  const handle = document.getElementById('sidebar-resize-handle');
  let resizing = false, resizeStartX = 0, resizeStartW = 0;
  handle.addEventListener('mousedown', e => {
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartW = sidebar.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const w = Math.max(52, Math.min(400, resizeStartW + e.clientX - resizeStartX));
    document.documentElement.style.setProperty('--sidebar-w', w + 'px');
    if (w > 80 && sidebar.classList.contains('collapsed')) setSidebarCollapsed(false);
    localStorage.setItem('sidebar-w', w);
  });
  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
  const savedW = localStorage.getItem('sidebar-w');
  if (savedW) document.documentElement.style.setProperty('--sidebar-w', parseInt(savedW) + 'px');

  document.getElementById('nav').addEventListener('click', e => {
    const item = e.target.closest('.nav-item');
    if (item && !item.disabled && item.dataset.view) switchView(item.dataset.view);
  });

  // Jobs tab - dashboard
  document.getElementById('btn-add-job').addEventListener('click', openAddJobView);
  document.getElementById('btn-back-from-add').addEventListener('click', () => {
    renderJobsDashboard(); showJobsSubview('dashboard');
  });
  document.getElementById('btn-back-from-detail').addEventListener('click', () => {
    renderJobsDashboard(); showJobsSubview('dashboard');
  });
  document.getElementById('job-cards').addEventListener('click', e => {
    const retry = e.target.closest('.jc-retry');
    if (retry) { retryErroredJob(retry.dataset.id); return; }
    const dismiss = e.target.closest('.jc-dismiss');
    if (dismiss) { dismissErroredJob(dismiss.dataset.id); return; }
    const delBtn = e.target.closest('.jc-delete-btn');
    if (delBtn) { openDeleteJobDialog(delBtn.dataset.id); return; }
    if (e.target.closest('.job-status-select') || e.target.closest('.job-link-icon')) return;
    const card = e.target.closest('.job-card');
    if (!card) return;
    const job = jobById(card.dataset.id);
    if (!job || job.pending || job.updating || job.error) return;  // busy/error cards aren't clickable
    showJobDetail(card.dataset.id);
  });
  document.getElementById('job-cards').addEventListener('change', e => {
    const sel = e.target.closest('.job-status-select');
    if (sel) updateJobStatus(sel.dataset.id, sel.value);
  });
  document.getElementById('detail-status-select').addEventListener('change', e => {
    updateJobStatus(e.target.dataset.id, e.target.value);
    const statCol = STATUS_COLORS[e.target.value] || 'var(--dim)';
    const badge = document.getElementById('detail-status-badge');
    badge.textContent = STATUS_LABELS[e.target.value] || e.target.value;
    badge.style.setProperty('--status-color', statCol);
  });
  document.getElementById('btn-delete-job').addEventListener('click', () => {
    if (state.activeJobId) openDeleteJobDialog(state.activeJobId);
  });
  document.getElementById('btn-delete-job-cancel').addEventListener('click',
    () => document.getElementById('delete-job-dialog').hide());
  document.getElementById('btn-delete-job-confirm').addEventListener('click', doDeleteJob);

  // Job detail - tab strip + all dynamically rendered buttons
  document.getElementById('jobs-detail').addEventListener('click', e => {
    const tab = e.target.closest('.detail-tab');
    if (tab?.dataset.tab) { switchDetailTab(tab.dataset.tab); return; }
    const tabLink = e.target.closest('.detail-tab-link');
    if (tabLink?.dataset.tab) { switchDetailTab(tabLink.dataset.tab); return; }

    if (e.target.closest('#btn-reanalyze-analysis')) { reAnalyzeJob(); return; }
    if (e.target.closest('#btn-reset-ignored-skills')) { resetIgnoredAnalysisSkills(); return; }
    const skillToggle = e.target.closest('[data-analysis-skill]');
    if (skillToggle?.dataset.analysisSkill) { toggleIgnoredAnalysisSkill(skillToggle.dataset.analysisSkill); return; }
    const openJobBtn = e.target.closest('#btn-open-job-browser');
    if (openJobBtn?.dataset.openUrl) {
      bridge.openExternal(openJobBtn.dataset.openUrl)
        .then(result => { if (!result?.ok) showToast(result?.error || 'Could not open browser.'); })
        .catch(err => showToast(`Could not open browser: ${err.message}`));
      return;
    }
    const historyBtn = e.target.closest('.mc-history-open');
    if (historyBtn?.dataset.runId) { openAnalysisSnapshot(historyBtn.dataset.runId); return; }

  });

  // Jobs tab - add job form
  document.getElementById('add-job-desc').addEventListener('input', () => {
    document.getElementById('btn-save-job').disabled =
      document.getElementById('add-job-desc').value.trim().length < 10;
  });
  document.getElementById('btn-save-job').addEventListener('click', saveAndAnalyzeJob);

  // Jobs tab - paste-to-analyze (Ctrl/Cmd+V on the dashboard)
  document.addEventListener('paste', onGlobalPaste);
  document.getElementById('btn-paste-cancel').addEventListener('click', () => {
    document.getElementById('paste-job-dialog').hide();
    _pendingPasteUrl = null;
  });
  document.getElementById('btn-paste-analyze').addEventListener('click', () => {
    if (_pendingPasteUrl) startPasteAnalyze(_pendingPasteUrl, null);
  });
  document.getElementById('btn-dup-visit').addEventListener('click', () => {
    document.getElementById('dup-job-dialog').hide();
    if (_dupCtx) showJobDetail(_dupCtx.jobId);
  });
  document.getElementById('btn-dup-update').addEventListener('click', () => {
    if (_dupCtx) startPasteAnalyze(_dupCtx.url, _dupCtx.jobId);
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('model-badge')?.addEventListener('click', openSettings);
  document.getElementById('auto-analyze-toggle').addEventListener('sl-change', e => {
    state.autoAnalyzePaste = e.target.checked;
    localStorage.setItem('auto-analyze-paste', e.target.checked ? '1' : '');
  });
  document.getElementById('btn-settings-close').addEventListener('click',
    () => document.getElementById('settings-dialog').hide());
  document.getElementById('btn-close-analysis-history').addEventListener('click',
    () => document.getElementById('analysis-history-dialog').hide());
  document.getElementById('btn-save-key').addEventListener('click', saveKey);
  document.getElementById('btn-set-model').addEventListener('click', setModel);
  document.getElementById('connected-list').addEventListener('click', e => {
    const btn = e.target.closest('.provider-tag-remove');
    if (btn) removeKey(btn.dataset.pid);
  });
  document.getElementById('model-provider').addEventListener('sl-change', e =>
    updateModelSelectForProvider(e.target.value));
  document.getElementById('model-select').addEventListener('sl-change', e =>
    document.getElementById('btn-set-model').disabled = !e.target.value);

  // Settings dialog - browser profile section (delegated: content is dynamically rendered)
  document.getElementById('settings-dialog').addEventListener('click', e => {
    if (e.target.closest('#btn-setup-browser-profile')) {
      setupBrowserProfile();
      return;
    }
    if (e.target.closest('#btn-confirm-signin')) {
      confirmGoogleLogin();
      return;
    }
    if (e.target.closest('#btn-cancel-signin')) {
      cancelBrowserSignin();
      return;
    }
    if (e.target.closest('#btn-reset-browser-profile')) {
      openResetProfileDialog();
    }
  });

  // Reset browser profile confirmation dialog
  document.getElementById('btn-reset-profile-cancel').addEventListener('click',
    () => document.getElementById('reset-browser-dialog').hide());
  document.getElementById('btn-reset-profile-confirm').addEventListener('click', () => {
    if (_resetProfileStep === 1) {
      _resetProfileStep = 2;
      const body = document.getElementById('reset-browser-dialog-body');
      const confirmBtn = document.getElementById('btn-reset-profile-confirm');
      if (body) body.textContent = 'This is permanent and cannot be undone.';
      if (confirmBtn) confirmBtn.textContent = 'I understand, delete everything';
    } else {
      // doResetBrowserProfile shows a busy state on the confirm button and
      // hides the dialog itself once the reset finishes.
      doResetBrowserProfile();
    }
  });

  window.addEventListener('resize', () => { scaleAllResumePanes(); updatePaneHeight(); });

  // Scanner tab
  document.getElementById('btn-scanner-run').addEventListener('click', runScannerScan);
  document.getElementById('btn-scanner-add-search').addEventListener('click', async () => {
    state.scanner.settings.searches = [...(state.scanner.settings.searches || []),
      { keywords: '', location: '', workplace_types: [], employment_types: [], date_posted: '' }];
    renderScannerSettings();
  });
  document.getElementById('scanner-include-recommended').addEventListener('sl-change', persistScannerSettingsFromForm);
  document.getElementById('scanner-searches').addEventListener('click', e => {
    const remove = e.target.closest('.scanner-search-remove');
    if (remove) {
      const row = remove.closest('.scanner-search-row');
      const idx = Number(row.dataset.index);
      state.scanner.settings.searches.splice(idx, 1);
      renderScannerSettings();
      persistScannerSettingsFromForm();
      return;
    }
    const chip = e.target.closest('.scanner-chip');
    if (chip) {
      const idx = Number(chip.dataset.index);
      const group = chip.dataset.group;
      const value = chip.dataset.value;
      const search = state.scanner.settings.searches[idx];
      if (chip.dataset.single) {
        search[group] = value;
      } else {
        const list = search[group] || (search[group] = []);
        const pos = list.indexOf(value);
        if (pos === -1) list.push(value); else list.splice(pos, 1);
      }
      renderScannerSettings();
      persistScannerSettingsFromForm();
    }
  });
  document.getElementById('scanner-searches').addEventListener('change', e => {
    if (e.target.classList.contains('scanner-search-input')) persistScannerSettingsFromForm();
  });
  document.getElementById('scanner-feed').addEventListener('click', e => {
    const link = e.target.closest('.scanner-card-link');
    if (link) { bridge.openExternal(link.dataset.url); return; }
    const add = e.target.closest('.scanner-card-add');
    if (add && !add.disabled) { addScannerJobToJobs(add.dataset.key); return; }
    const dismiss = e.target.closest('.scanner-card-dismiss');
    if (dismiss) { dismissScannerJob(dismiss.dataset.key); return; }
  });
}

// ── Init ────────────────────────────────────────────────────────────────────────
async function init() {
  state.autoAnalyzePaste = localStorage.getItem('auto-analyze-paste') === '1';
  wire();
  await new Promise(resolve => {
    if (window.pywebview) return resolve();
    window.addEventListener('pywebviewready', resolve, { once: true });
  });

  try {
    const config = await bridge.getConfig();
    state.config = config;
    state.port = config.opencode_port;
    state.defaultModel = config.default_model || '';
    document.title = config.app_title || 'Persona';
    const brand = document.querySelector('.brand-text');
    if (brand) brand.textContent = config.app_title || 'Persona';
    updateModelBadge();
  } catch (e) {
    showToast('Failed to connect to backend');
    return;
  }

  await refreshDocs();
  const [hasProfile] = await Promise.all([loadProfile(), loadBrowserProfileStatus()]);
  if (hasProfile) renderProfileSections();
  showProfileSubview('main');
}

init();

