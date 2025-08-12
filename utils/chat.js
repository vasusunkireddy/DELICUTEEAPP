// utils/chat.js
export function getChatId(userA, userB) {
  const idA = String(userA).trim();
  const idB = String(userB).trim();
  const result = [idA, idB].sort().join("_");
  console.log("getChatId", { idA, idB, result }); // Debug!
  return result;
}
