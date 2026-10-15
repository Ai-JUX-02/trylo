# Legacy stream parity fixture

Controlled loopback fixture captured from the historical legacy engine. It reads
`proof.txt`, whose entire synthetic body is `PARITY-FILE-CONTENT`, then returns
`DONE`. It contains protocol frames, not CLI source or an executable.

The system cwd is normalised to `C:/fixtures/trylo-stream-parity`. No user task,
provider credentials or private workspace file content is included.
`desktop/src/host-adapter/cli-stream-parity.test.ts` compares this stream with a
real new CLI process driven by a local synthetic OpenAI server, checking text,
tool readback and terminal behavior. Replaying the fixture does not need the
old engine. It is compatibility evidence, not a real-provider acceptance run.
