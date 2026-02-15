import Agent from "src/agent";

// const agent = await Agent.build({
//   token:
//     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMjI3NyIsIm5hbWUiOiJtaW5pbWlfbG9yaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzU2MzI5MzA3fQ.o_-KQSi-mpQFdgUOVIrZcoe5nlMQJazXfC991n1wNLs",
// });

const agent = await Agent.build({});
const agent1 = await Agent.build({});

agent.run();
agent1.run();

setTimeout(() => {
  agent.stop();
  agent1.stop();
}, 60000);
