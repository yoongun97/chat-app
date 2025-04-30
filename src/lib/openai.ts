import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function getChatCompletion(messages: Message[]) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error getting chat completion:', error);
    throw error;
  }
} 