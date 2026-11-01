import 'dotenv/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not defined in environment variables');
}

export const gemini38Model = new ChatGoogleGenerativeAI({
  model: 'gemini-3.8-flash',
  temperature: 0.1,
  maxRetries: 3,
  apiKey,
});

export const gemini36Model = new ChatGoogleGenerativeAI({
  model: 'gemini-3.6-flash',
  temperature: 0.2,
  maxRetries: 2,
  apiKey,
});