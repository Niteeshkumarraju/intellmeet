// TypeScript version of gemini.js — converted from gemini.js
import axios from 'axios'

interface GeminiSummaryResponse {
  summary: string
  cached: boolean
}

interface GeminiAnalysisResponse {
  analysis: {
    meetingScore: number
    sentiment: string
    sentimentScore: number
    keyTopics: string[]
    summary: string
    highlights: string[]
    risks: string[]
    decisions: string[]
    participationRate: number
    engagementLevel: string
    followUpRequired: boolean
    nextSteps: string[]
    meetingEfficiency: number
    estimatedROI: string
    recommendations: string[]
  }
  cached: boolean
}

interface GeminiTranslateResponse {
  translatedText: string
  cached?: boolean
}

const getAuthHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

export const generateSummary = async (
  transcript: string,
  token: string
): Promise<GeminiSummaryResponse> => {
  const { data } = await axios.post<GeminiSummaryResponse>(
    '/api/ai/summary',
    { transcript },
    { headers: getAuthHeaders(token) }
  )
  return data
}

export const analyzeMeeting = async (
  meeting: Record<string, unknown>,
  messages: Record<string, unknown>[],
  token: string
): Promise<GeminiAnalysisResponse> => {
  const { data } = await axios.post<GeminiAnalysisResponse>(
    '/api/ai/analyze',
    { meeting, messages },
    { headers: getAuthHeaders(token) }
  )
  return data
}

export const translateText = async (
  text: string,
  targetLanguage: string,
  token: string
): Promise<GeminiTranslateResponse> => {
  const { data } = await axios.post<GeminiTranslateResponse>(
    '/api/ai/translate',
    { text, targetLanguage },
    { headers: getAuthHeaders(token) }
  )
  return data
}
