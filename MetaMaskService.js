const WALLET_KEY = "playerWallet";
const SIGN_MESSAGE = "Sign in to Horse Trainer Demo";

function ensureProvider() {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error("MetaMask is not installed.");
  }
  return provider;
}

export async function connectWallet() {
  const provider = ensureProvider();
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts || !accounts.length) {
    throw new Error("Wallet connection rejected.");
  }
  const walletAddress = accounts[0];
  localStorage.setItem(WALLET_KEY, walletAddress);
  return walletAddress;
}

export async function signMessage(walletAddress) {
  const provider = ensureProvider();
  try {
    await provider.request({
      method: "personal_sign",
      params: [SIGN_MESSAGE, walletAddress]
    });
    return true;
  } catch (err) {
    console.warn("Signature rejected", err);
    return false;
  }
}

export function getStoredWallet() {
  return localStorage.getItem(WALLET_KEY);
}

export function clearStoredWallet() {
  localStorage.removeItem(WALLET_KEY);
}

export function getSignMessage() {
  return SIGN_MESSAGE;
}
