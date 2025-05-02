import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export type ChatModel = 'gpt-4.1-mini' | 'gpt-4o-mini-audio-preview';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function getChatCompletion(messages: Message[], model: ChatModel = 'gpt-4.1-mini') {
  try {
    console.log('Using model:', model);
    console.log('Messages:', messages);

    const requestBody: any = {
      model: model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: 1,
      max_completion_tokens: 2048,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      store: false
    };

    // audio 모델인 경우 추가 설정
    if (model === 'gpt-4o-mini-audio-preview') {
      requestBody.modalities = ['text', 'audio'];
      requestBody.audio = {
        voice: 'alloy',
        format: 'pcm16'
      };
      console.log('Audio model configuration:', {
        modalities: requestBody.modalities,
        audio: requestBody.audio
      });
    }

    // response_format 설정 (gpt-4.1-mini 모델용)
    if (model === 'gpt-4.1-mini') {
      requestBody.response_format = {
        type: 'text'
      };
    }

    console.log('Final request body:', JSON.stringify(requestBody, null, 2));

    try {
      const completion = await openai.chat.completions.create(requestBody);
      console.log('API Response:', completion);
      return completion.choices[0].message.content;
    } catch (apiError: any) {
      console.error('OpenAI API Error:', {
        error: apiError,
        message: apiError.message,
        response: apiError.response?.data
      });
      throw new Error(`OpenAI API Error: ${apiError.message}`);
    }
  } catch (error) {
    console.error('Error in getChatCompletion:', error);
    throw error;
  }
} 