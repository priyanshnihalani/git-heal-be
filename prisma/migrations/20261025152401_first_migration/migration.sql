-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('DETECTED', 'INVESTIGATING', 'PATCHING', 'VERIFYING', 'PR_OPENED', 'MERGED', 'FAILED_TO_FIX', 'QUEUED');

-- CreateEnum
CREATE TYPE "RunStepName" AS ENUM ('Detect', 'Investigate', 'Patch', 'Verify', 'Open_PR');

-- CreateEnum
CREATE TYPE "RunStepStatus" AS ENUM ('pending', 'in_progress', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "TokenStage" AS ENUM ('detect', 'patch', 'critique');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "emailOnPrOpened" BOOLEAN NOT NULL DEFAULT true,
    "emailOnFixFailed" BOOLEAN NOT NULL DEFAULT true,
    "watchedBranches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onlyWatchedBranches" BOOLEAN NOT NULL DEFAULT false,
    "pauseOnThresholdEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pauseThresholdPercent" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "emailOnTokenThreshold" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT,
    "hasWorkflows" BOOLEAN NOT NULL DEFAULT false,
    "workFlowFile" TEXT,
    "lastCiStatus" TEXT,
    "monitored" BOOLEAN NOT NULL DEFAULT true,
    "installationId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "commitHash" TEXT NOT NULL,
    "commitMessage" TEXT,
    "githubRunUrl" TEXT NOT NULL,
    "duration" INTEGER,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "prNumber" INTEGER,
    "prUrl" TEXT,
    "rootCause" TEXT,
    "failureReason" TEXT,
    "humanRecommendation" TEXT,
    "failingLog" JSONB,
    "patch" JSONB,
    "sandbox" JSONB,
    "reasoningSteps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" "RunStepName" NOT NULL,
    "status" "RunStepStatus" NOT NULL DEFAULT 'pending',
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stage" "TokenStage" NOT NULL,
    "tokens" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_id_fkey" FOREIGN KEY ("id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStep" ADD CONSTRAINT "RunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
