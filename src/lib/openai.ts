import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export type ChatModel = 'gpt-4.1-mini' | 'gpt-4o-mini-audio-preview';

interface TextContent {
  type: 'text';
  text: string;
}

interface ImageUrlContent {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

type MessageContent = string | (TextContent | ImageUrlContent)[];

export interface Message {
  role: 'user' | 'assistant';
  content: MessageContent;
}

function convertToApiMessage(msg: Message): ChatCompletionMessageParam {
  return {
    role: msg.role,
    content: typeof msg.content === 'string' ? msg.content : 
      msg.content.map(item => {
        if (item.type === 'text') return item.text;
        return { type: 'image_url', image_url: item.image_url };
      })
  } as ChatCompletionMessageParam;
}

async function handleMiniModel(messages: Message[]) {
  const requestBody = {
    model: 'gpt-4.1-mini' as const,
    messages: messages.map(convertToApiMessage),
    temperature: 1,
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    response_format: { type: 'text' as const }
  };

  const completion = await openai.chat.completions.create(requestBody);
  
  if (!completion.choices || completion.choices.length === 0) {
    throw new Error('API 응답에 choices가 없습니다.');
  }

  const messageContent = completion.choices[0].message.content;
  if (!messageContent) {
    throw new Error('API 응답에 content가 없습니다.');
  }

  return messageContent;
}

async function handleAudioPreviewModel(messages: Message[]) {
  const requestBody = {
    model: 'gpt-4o-mini-audio-preview' as const,
    messages: messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : 
        msg.content.find((item): item is TextContent => item.type === 'text')?.text || ''
    })) as ChatCompletionMessageParam[],
    temperature: 1,
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    modalities: ['text', 'audio'] as ('text' | 'audio')[],
    audio: {
      voice: 'alloy' as const,
      format: 'pcm16' as const
    }
  };

  const completion = await openai.chat.completions.create(requestBody);

  if (!completion.choices || completion.choices.length === 0) {
    throw new Error('API 응답에 choices가 없습니다.');
  }

  const messageContent = completion.choices[0].message.content;
  if (!messageContent) {
    throw new Error('API 응답에 content가 없습니다.');
  }

  if (Array.isArray(messageContent)) {
    const textContent = messageContent.find((item: any) => item.type === 'text');
    if (!textContent) {
      throw new Error('audio-preview 모델 응답에서 텍스트 컨텐츠를 찾을 수 없습니다.');
    }
    return textContent.text;
  }

  return messageContent;
}

export async function getChatCompletion(messages: Message[], model: ChatModel = 'gpt-4.1-mini') {
  try {
    console.log('Using model:', model);
    console.log('Messages:', messages);

    if (model === 'gpt-4.1-mini') {
      return await handleMiniModel(messages);
    } else {
      return await handleAudioPreviewModel(messages);
    }
  } catch (error) {
    console.error('Error in getChatCompletion:', error);
    throw error;
  }
} 