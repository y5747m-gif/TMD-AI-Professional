body: JSON.stringify({
  model: image
    ? "meta-llama/llama-4-scout-17b-16e-instruct"
    : state.model,

  messages: history
})
