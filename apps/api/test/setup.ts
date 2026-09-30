process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'reachinbox-test-session-secret-32-bytes-minimum';
process.env.BULL_BOARD_ADMIN_EMAILS ||= 'test@reachinbox.local';