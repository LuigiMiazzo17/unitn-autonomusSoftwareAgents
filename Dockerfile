FROM node:22 AS builder

# Set the working directory
WORKDIR /build

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY .  ./

# Build the application
RUN npm run build

FROM node:22

# Set the working directory
WORKDIR /app

# Copy the built application from the builder stage
COPY --from=builder /build/dist ./dist

# Copy the node_modules from the builder stage
COPY --from=builder /build/node_modules ./node_modules

USER node

CMD ["node", "/app/dist/app.js"]
