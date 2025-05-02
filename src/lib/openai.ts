import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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

export async function getChatCompletion(
  messages: Message[],
  model: ChatModel = 'gpt-4.1-mini'
) {
  try {
    const apiMessages = messages.map(convertToApiMessage);
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: apiMessages, model }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get chat completion');
    }

    const data = await response.json();
    return data.content;
  } catch (error) {
    console.error('Error in getChatCompletion:', error);
    throw error;
  }
} 