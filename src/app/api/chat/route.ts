import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { messages, model } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      messages: messages as ChatCompletionMessageParam[],
      model: model || 'gpt-4.1-mini',
      temperature: 1,
      max_tokens: 2048,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    if (!completion.choices || completion.choices.length === 0) {
      throw new Error('No response from OpenAI API');
    }

    return NextResponse.json(completion.choices[0].message);
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
} 