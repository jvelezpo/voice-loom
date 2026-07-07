'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'
import { generateAudioForText, type GenerateAudioState } from '../../actions'

type VoiceOption = {
  key: string
  label: string
}

type AudioGenerationItem = {
  id: number
  voiceKey: string
  voiceLabel: string
  createdAt: string
  createdAtLabel: string
}

type AiVoiceAssignment = {
  characterName: string
  voiceKey: string
  speakerIndex: number
}

type AiAudioGenerationItem = AudioGenerationItem & {
  voiceAssignments: AiVoiceAssignment[]
}

type AudioAnalysisCharacter = {
  name: string
  description: string
}

type AudioAnalysisTurn = {
  order: number
  characterName: string
  text: string
}

type AudioAnalysis = {
  languageCode: string
  languageName: string
  characters: AudioAnalysisCharacter[]
  turns: AudioAnalysisTurn[]
  updatedAt: string
  updatedAtLabel: string
}

type AutoGenerateState = {
  status: 'idle' | 'success' | 'error'
  message: string
  audioGenerationId?: number
}

type AudioGenerationsProps = {
  textEntryId: number
  voiceOptions: VoiceOption[]
  aiAudioGenerations: AiAudioGenerationItem[]
  audioGenerations: AudioGenerationItem[]
  audioAnalysis: AudioAnalysis | null
}

const initialState: GenerateAudioState = {
  status: 'idle',
  message: '',
}

const initialAutoGenerateState: AutoGenerateState = {
  status: 'idle',
  message: '',
}

function audioGenerationDomId(id: number) {
  return `audio-generation-${id}`
}

export function AudioGenerations({
  textEntryId,
  voiceOptions,
  aiAudioGenerations,
  audioGenerations,
  audioAnalysis,
}: AudioGenerationsProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(
    generateAudioForText,
    initialState,
  )
  const [autoState, setAutoState] = useState(initialAutoGenerateState)
  const [isAutoPending, setIsAutoPending] = useState(false)

  useEffect(() => {
    const audioGenerationId =
      autoState.audioGenerationId ?? state.audioGenerationId

    if (!audioGenerationId) {
      return
    }

    const audioGeneration = document.getElementById(
      audioGenerationDomId(audioGenerationId),
    )

    audioGeneration?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [
    autoState.audioGenerationId,
    state.audioGenerationId,
    aiAudioGenerations.length,
    audioGenerations.length,
  ])

  async function handleAutoGenerateAudio() {
    setIsAutoPending(true)
    setAutoState(initialAutoGenerateState)

    try {
      const response = await fetch('/api/audio-generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ textEntryId }),
      })
      const data = (await response.json().catch(() => null)) as {
        message?: string
        audioGenerationId?: number
      } | null

      if (!response.ok) {
        setAutoState({
          status: 'error',
          message:
            data?.message ?? 'AI audio generation failed. Please try again.',
        })
        return
      }

      setAutoState({
        status: 'success',
        message: data?.message ?? 'AI audio generated.',
        audioGenerationId: data?.audioGenerationId,
      })
      router.refresh()
    } catch {
      setAutoState({
        status: 'error',
        message: 'AI audio generation failed. Please try again.',
      })
    } finally {
      setIsAutoPending(false)
    }
  }

  return (
    <>
      <form
        action={formAction}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start border-t border-zinc-200 pt-6 mt-4"
      >
        <input type="hidden" name="textEntryId" value={textEntryId} />
        <div className="flex flex-row gap-2 sm:min-w-64 items-center">
          <label
            htmlFor="voiceKey"
            className="text-sm font-medium text-zinc-800"
          >
            Voice
          </label>
          <select
            id="voiceKey"
            name="voiceKey"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          >
            {voiceOptions.map((voice) => (
              <option key={voice.key} value={voice.key}>
                {voice.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isPending ? 'Generating...' : 'Generate audio'}
        </button>
      </form>

      <section className="mt-8 border-t border-zinc-200 pt-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-zinc-950">
              AI audio plan
            </h2>
            <button
              type="button"
              disabled={isAutoPending}
              onClick={handleAutoGenerateAudio}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isAutoPending ? 'Generating...' : 'Auto Generate Audio'}
            </button>
          </div>

          {autoState.message ? (
            <p
              className={[
                'rounded-lg border px-3 py-2 text-sm',
                autoState.status === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800',
              ].join(' ')}
              role="status"
            >
              {autoState.message}
            </p>
          ) : null}

          {audioAnalysis ? (
            <div className="flex flex-col gap-4 border-l-4 border-emerald-600 pl-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm text-zinc-700">
                  Language:{' '}
                  <span className="font-semibold text-zinc-950">
                    {audioAnalysis.languageName}
                  </span>{' '}
                  <span className="text-zinc-500">
                    ({audioAnalysis.languageCode})
                  </span>
                </p>
                <time
                  dateTime={audioAnalysis.updatedAt}
                  className="text-sm text-zinc-500"
                >
                  {audioAnalysis.updatedAtLabel}
                </time>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-zinc-950">
                  Characters
                </h3>
                {audioAnalysis.characters.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No distinct characters found.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {audioAnalysis.characters.map((character) => (
                      <li key={character.name} className="text-sm text-zinc-700">
                        <span className="font-semibold text-zinc-950">
                          {character.name}
                        </span>
                        {character.description ? (
                          <span> - {character.description}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-zinc-950">
                  Ordered turns
                </h3>
                {audioAnalysis.turns.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No ordered turns saved yet.
                  </p>
                ) : (
                  <ol className="grid gap-3">
                    {audioAnalysis.turns.map((turn) => (
                      <li
                        key={`${turn.order}-${turn.characterName}`}
                        className="text-sm text-zinc-700"
                      >
                        <p className="font-semibold text-zinc-950">
                          {turn.order}. {turn.characterName}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap border-l-2 border-zinc-200 pl-3 leading-6 text-zinc-700">
                          {turn.text}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-8 border-t border-zinc-200 pt-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-950">
              AI Audio generations
            </h2>
            <span className="text-sm text-zinc-500">
              {aiAudioGenerations.length} saved
            </span>
          </div>

          {aiAudioGenerations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
              No AI audio generated yet.
            </div>
          ) : (
            <ul className="grid gap-3">
              {aiAudioGenerations.map((audioGeneration) => (
                <li
                  id={audioGenerationDomId(audioGeneration.id)}
                  key={audioGeneration.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 transition"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-950">
                          {audioGeneration.voiceLabel}
                        </h3>
                        {audioGeneration.voiceAssignments.length > 0 ? (
                          <p className="break-words text-sm text-zinc-500">
                            {audioGeneration.voiceAssignments
                              .map(
                                (assignment) =>
                                  `${assignment.characterName}: ${assignment.voiceKey}`,
                              )
                              .join(' | ')}
                          </p>
                        ) : null}
                      </div>
                      <time
                        dateTime={audioGeneration.createdAt}
                        className="text-sm text-zinc-500"
                      >
                        {audioGeneration.createdAtLabel}
                      </time>
                    </div>

                    <audio
                      controls
                      controlsList="nodownload"
                      preload="none"
                      src={`/api/audio-generations/${audioGeneration.id}/stream`}
                      className="w-full"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 border-t border-zinc-200 pt-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-950">
              Audio generations
            </h2>
            <span className="text-sm text-zinc-500">
              {audioGenerations.length} saved
            </span>
          </div>

          {state.message ? (
            <p
              className={[
                'rounded-lg border px-3 py-2 text-sm',
                state.status === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800',
              ].join(' ')}
              role="status"
            >
              {state.message}
            </p>
          ) : null}

          {audioGenerations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
              No audio generated yet.
            </div>
          ) : (
            <ul className="grid gap-3">
              {audioGenerations.map((audioGeneration) => {
                const isHighlighted =
                  state.audioGenerationId === audioGeneration.id

                return (
                  <li
                    id={audioGenerationDomId(audioGeneration.id)}
                    key={audioGeneration.id}
                    className={[
                      'rounded-lg border p-4 transition',
                      isHighlighted
                        ? 'border-emerald-300 bg-emerald-50 shadow-md ring-4 ring-emerald-100'
                        : 'border-zinc-200 bg-white',
                    ].join(' ')}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-zinc-950">
                            {audioGeneration.voiceLabel}
                          </h3>
                          <p className="text-sm text-zinc-500">
                            {audioGeneration.voiceKey}
                          </p>
                        </div>
                        <time
                          dateTime={audioGeneration.createdAt}
                          className="text-sm text-zinc-500"
                        >
                          {audioGeneration.createdAtLabel}
                        </time>
                      </div>

                      <audio
                        controls
                        controlsList="nodownload"
                        preload="none"
                        src={`/api/audio-generations/${audioGeneration.id}/stream`}
                        className="w-full"
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
