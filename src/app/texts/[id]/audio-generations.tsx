'use client'

import { useActionState, useEffect } from 'react'
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

type AudioGenerationsProps = {
  textEntryId: number
  voiceOptions: VoiceOption[]
  audioGenerations: AudioGenerationItem[]
}

const initialState: GenerateAudioState = {
  status: 'idle',
  message: '',
}

function audioGenerationDomId(id: number) {
  return `audio-generation-${id}`
}

export function AudioGenerations({
  textEntryId,
  voiceOptions,
  audioGenerations,
}: AudioGenerationsProps) {
  const [state, formAction, isPending] = useActionState(
    generateAudioForText,
    initialState,
  )

  useEffect(() => {
    if (!state.audioGenerationId) {
      return
    }

    const audioGeneration = document.getElementById(
      audioGenerationDomId(state.audioGenerationId),
    )

    audioGeneration?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [state.audioGenerationId, audioGenerations.length])

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
