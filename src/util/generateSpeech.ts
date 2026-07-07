// import { FishAudioClient } from "fish-audio";
// import { writeFile } from "fs/promises";

// const fishAudio = new FishAudioClient({ apiKey: '9653b4828a0c4f3fb0101086158e40df' });
// // const fishAudio = new FishAudioClient({ apiKey: process.env.FISH_API_KEY });

// fishAudio.
// const audio = await fishAudio.textToSpeech.convert({
//   text: "Hello, world!",
  
// });

// const buffer = Buffer.from(await new Response(audio).arrayBuffer());
// await writeFile("welcome.mp3", buffer);

// console.log("✓ Audio saved to welcome.mp3");



import { writeFile } from "fs/promises";

const body = {
  text: `¡Escúchame bien, sabandija! Si crees que con ese nivel tan patético podrás superarme, estás muy equivocado. ¡Soy el príncipe de los Saiyajin! No me hagas perder el tiempo con tus débiles técnicas. ¡Muéstrame tu verdadero poder o lárgate de mi vista!`,
  reference_id: "86bc0bf60af340a887cfb9629bd7047a",
  format: "mp3",
};

const res = await fetch("https://api.fish.audio/v1/tts", {
  method: "POST",
  headers: {
    // Authorization: `Bearer ${'9653b4828a0c4f3fb0101086158e40df'}`,
    Authorization: `Bearer ${process.env.FISH_API_KEY}`,
    "Content-Type": "application/json",
    model: "s2.1-pro-free",
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  throw new Error(`TTS request failed: ${res.status} ${await res.text()}`);
}

const buffer = Buffer.from(await res.arrayBuffer());
await writeFile("output.mp3", buffer);