import logger from '../utils/logger.js';

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return { message, statusCode: 400 };
};

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `Duplicate field value: ${field} = '${value}'. Please use another value.`;
  return { message, statusCode: 400 };
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return { message, statusCode: 400 };
};

const handleJWTError = () => {
  return { message: 'Invalid token. Please log in again.', statusCode: 401 };
};

const handleJWTExpiredError = () => {
  return { message: 'Your token has expired. Please log in again.', statusCode: 401 };
};

const sendErrorDev = (err, res) => {
  res.status(err.statusCode || 500).json({
    status: err.status || 'error',
    error: err,
    message: err.message,
    stack: err.stack
  });
};

const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  } 
  // Programming or unknown error: don't leak details
  else {
    logger.error('ERROR 💥', err);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!'
    });
  }
};

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err, message: err.message };

    // Mongoose errors
    if (err.name === 'CastError') {
      const result = handleCastErrorDB(err);
      error.message = result.message;
      error.statusCode = result.statusCode;
      error.isOperational = true;
    }
    
    if (err.code === 11000) {
      const result = handleDuplicateFieldsDB(err);
      error.message = result.message;
      error.statusCode = result.statusCode;
      error.isOperational = true;
    }
    
    if (err.name === 'ValidationError') {
      const result = handleValidationErrorDB(err);
      error.message = result.message;
      error.statusCode = result.statusCode;
      error.isOperational = true;
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
      const result = handleJWTError();
      error.message = result.message;
      error.statusCode = result.statusCode;
      error.isOperational = true;
    }
    
    if (err.name === 'TokenExpiredError') {
      const result = handleJWTExpiredError();
      error.message = result.message;
      error.statusCode = result.statusCode;
      error.isOperational = true;
    }

    sendErrorProd(error, res);
  }
};

export default errorHandler;