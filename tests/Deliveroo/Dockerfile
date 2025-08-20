FROM node:22

# Our project files are in ./Deliveroo.js/backend/
RUN apt-get update && apt-get install -y \
    libpango1.0-dev && \
    rm -rf /var/lib/apt/lists/*

USER node

# Set the working directory
WORKDIR /app/backend

# Copy package.json and package-lock.json
COPY --chown=node:node ./Deliveroo.js/backend/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY --chown=node:node ./Deliveroo.js/ /app/

# Build the application
RUN npm run build

# Copy the test environment variables
COPY --chown=node:node --chmod=440 .test.env .

# Expose the port the app runs on
EXPOSE 8080

# Start the application
CMD ["node", "--env-file=.test.env", "index.js"]
