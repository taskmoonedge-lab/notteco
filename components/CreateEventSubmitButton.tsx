export default function CreateEventSubmitButton() {
  return (
    <button
      type="submit"
      className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
    >
      今すぐイベントを作成
    </button>
  )
}
