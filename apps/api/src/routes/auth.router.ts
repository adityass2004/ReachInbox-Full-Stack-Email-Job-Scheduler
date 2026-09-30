import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter: Router = Router();

authRouter.get('/google', (req, res, next) => {
    authController.google(req, res, next);
});

authRouter.get('/google/callback', (req, res, next) => {
    authController.callback(req, res, next);
});

authRouter.get('/dev-login', (req, res, next) => {
    void authController.devLogin(req, res, next);
});

authRouter.get('/me', authenticate, (req, res) => {
    authController.me(req, res);
});

authRouter.post('/logout', (req, res) => {
    void authController.logout(req, res);
});