declare global {
  namespace Express {
    interface Request {
      auth?: { role: string; userId: string };
      requestId: string;
    }
  }
}

export {};
