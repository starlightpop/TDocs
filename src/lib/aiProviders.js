export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6', models: ['gpt-5.6', 'gpt-5.5', 'gpt-5'] },
  { id: 'anthropic', name: 'Anthropic（Claude）', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5', models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.6-flash', models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  { id: 'doubao', name: '字节 豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2.1-pro', models: ['doubao-seed-2.1-pro', 'doubao-seed-2.1-turbo'] },
  { id: 'qwen', name: '阿里 通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-max', models: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.7-flash'] },
  { id: 'moonshot', name: 'Moonshot（Kimi）', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3', models: ['kimi-k3', 'kimi-k2.7-code'] },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2', models: ['glm-5.2', 'glm-5', 'glm-4.6'] },
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V4', models: ['deepseek-ai/DeepSeek-V4', 'moonshotai/Kimi-k3', 'Qwen/Qwen3.8-Max'] },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-flash', models: ['deepseek/deepseek-v4-flash', 'openai/gpt-5.5', 'anthropic/claude-sonnet-5'] },
  { id: 'ollama', name: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', models: ['qwen3:8b', 'deepseek-r1:8b', 'llama4:10b'] },
  { id: 'custom', name: '自定义', baseUrl: '', model: '', models: [] },
]

export function getProvider(providerId) {
  return PROVIDERS.find((provider) => provider.id === providerId) || PROVIDERS[PROVIDERS.length - 1]
}
