import axios from 'axios'

export const generateMeetingSummary = async (meetingTitle, messages, transcriptLines, actionItems, token) => {
  const chatText = messages.map(m => `${m.sender?.name || 'User'}: ${m.content}`).join('\n')
  const speechText = (transcriptLines || []).map(t => `${t.name}: ${t.text}${t.translation ? ` (Translation: ${t.translation})` : ''}`).join('\n')
  const transcript = `Meeting: "${meetingTitle}"\n\nChat Messages:\n${chatText || 'No chat messages.'}\n\nSpeech Transcript:\n${speechText || 'No speech recorded.'}`

  const { data } = await axios.post(
    '/api/ai/summary',
    { transcript },
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return data.summary
}

export const analyzeMeeting = async (meeting, messages, token) => {
  const { data } = await axios.post(
    '/api/ai/analyze',
    { meeting, messages },
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return data.analysis
}