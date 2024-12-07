export let userId: string | number = 1;

export const setUserId = (newUserId: string | number) => {
  userId = newUserId;
};
