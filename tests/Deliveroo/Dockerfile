FROM node:22

# Our project files are in ./Deliveroo.js/backend/
RUN apt-get update && apt-get install -y \
    libpango1.0-dev && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app/backend

# Copy package.json and package-lock.json
COPY ./Deliveroo.js/backend/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY ./Deliveroo.js/ /app/

# Build the application
RUN npm run build

# Copy the test environment variables
COPY .test.env .

USER node

# Expose the port the app runs on
EXPOSE 8080

# Start the application
CMD ["node", "--env-file=.test.env", "index.js"]
