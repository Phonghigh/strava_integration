// src/utils/tokenStore.js
// Simple in-memory token store — replace with MongoDB for multi-user support

let tokenData = null;

export const saveToken = (data) => {
  tokenData = data;
};

export const getToken = () => tokenData;
