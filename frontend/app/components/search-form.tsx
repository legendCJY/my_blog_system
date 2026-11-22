import { useId } from "react";
import { Form } from "react-router";

export function SearchForm({ query = "" }: { query?: string }) {
  const fieldId = useId();

  return (
    <Form action="/search" method="get" className="search-form" role="search">
      <label className="visually-hidden" htmlFor={fieldId}>搜索文章</label>
      <input
        id={fieldId}
        type="search"
        name="q"
        placeholder="搜索文章"
        defaultValue={query}
        maxLength={200}
      />
      <button className="button button-primary" type="submit">搜索</button>
    </Form>
  );
}
