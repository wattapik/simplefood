<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreChatMessageRequest;
use App\Services\ChatAgentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use RuntimeException;

class ChatController extends Controller
{
    public function __construct(private ChatAgentService $chat) {}

    /**
     * The current conversation's display history (text only — tool calls are hidden).
     */
    public function index(Request $request): JsonResponse
    {
        try {
            $this->chat->assertConfigured($request->user());
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['messages' => $this->chat->history($request->user())]);
    }

    /**
     * Send a message and run the agentic tool-use loop until Claude has a final reply.
     */
    public function store(StoreChatMessageRequest $request): JsonResponse
    {
        try {
            $messages = $this->chat->reply($request->user(), $request->validated('message'));

            return response()->json(['messages' => $messages]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * Start a new conversation.
     */
    public function destroy(Request $request): Response
    {
        $this->chat->reset($request->user());

        return response()->noContent();
    }
}
