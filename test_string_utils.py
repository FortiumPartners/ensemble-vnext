"""Comprehensive tests for the string_utils module."""

import pytest

from string_utils import capitalize_words, reverse_string, count_vowels


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sample_sentence():
    """Provide a sample sentence for testing."""
    return "hello world"


@pytest.fixture
def mixed_case_sentence():
    """Provide a mixed case sentence for testing."""
    return "hElLo WoRlD"


@pytest.fixture
def sentence_with_numbers():
    """Provide a sentence containing numbers."""
    return "hello 123 world"


@pytest.fixture
def special_characters_text():
    """Provide text with special characters."""
    return "hello! @world# $test%"


@pytest.fixture
def vowel_rich_text():
    """Provide text rich in vowels."""
    return "aeiouAEIOU"


@pytest.fixture
def consonant_only_text():
    """Provide text with only consonants."""
    return "bcdfghjklmnpqrstvwxyz"


# =============================================================================
# Tests for capitalize_words
# =============================================================================


class TestCapitalizeWords:
    """Test suite for the capitalize_words function."""

    def test_basic_lowercase_sentence(self, sample_sentence):
        """Test capitalizing a basic lowercase sentence."""
        result = capitalize_words(sample_sentence)
        assert result == "Hello World"

    def test_mixed_case_sentence(self, mixed_case_sentence):
        """Test capitalizing a mixed case sentence."""
        result = capitalize_words(mixed_case_sentence)
        assert result == "Hello World"

    def test_already_capitalized(self):
        """Test text that is already properly capitalized."""
        text = "Hello World"
        result = capitalize_words(text)
        assert result == "Hello World"

    def test_all_uppercase(self):
        """Test converting all uppercase text."""
        text = "HELLO WORLD"
        result = capitalize_words(text)
        assert result == "Hello World"

    def test_single_word(self):
        """Test capitalizing a single word."""
        result = capitalize_words("hello")
        assert result == "Hello"

    def test_single_character(self):
        """Test capitalizing a single character."""
        result = capitalize_words("a")
        assert result == "A"

    def test_empty_string(self):
        """Test handling of empty string."""
        result = capitalize_words("")
        assert result == ""

    def test_whitespace_only(self):
        """Test handling of whitespace-only string."""
        result = capitalize_words("   ")
        assert result == "   "

    def test_sentence_with_numbers(self, sentence_with_numbers):
        """Test capitalizing text containing numbers."""
        result = capitalize_words(sentence_with_numbers)
        assert result == "Hello 123 World"

    def test_special_characters(self, special_characters_text):
        """Test capitalizing text with special characters."""
        result = capitalize_words(special_characters_text)
        # title() capitalizes after non-alphanumeric chars
        assert "Hello" in result

    def test_multiple_spaces_between_words(self):
        """Test handling multiple spaces between words."""
        result = capitalize_words("hello    world")
        assert result == "Hello    World"

    def test_leading_trailing_spaces(self):
        """Test handling leading and trailing spaces."""
        result = capitalize_words("  hello world  ")
        assert result == "  Hello World  "

    def test_newlines_and_tabs(self):
        """Test handling newlines and tabs."""
        result = capitalize_words("hello\nworld\tthere")
        assert result == "Hello\nWorld\tThere"

    def test_numbers_only(self):
        """Test handling numbers-only string."""
        result = capitalize_words("12345")
        assert result == "12345"

    def test_unicode_characters(self):
        """Test handling unicode characters."""
        result = capitalize_words("hello wörld")
        assert result == "Hello Wörld"

    def test_hyphenated_words(self):
        """Test capitalizing hyphenated words."""
        result = capitalize_words("well-known fact")
        # title() capitalizes after hyphens
        assert result == "Well-Known Fact"

    def test_apostrophes(self):
        """Test handling words with apostrophes."""
        result = capitalize_words("it's a test")
        # title() capitalizes after apostrophes
        assert "It" in result

    @pytest.mark.parametrize(
        "input_text,expected",
        [
            ("hello", "Hello"),
            ("HELLO", "Hello"),
            ("HeLLo", "Hello"),
            ("hello world", "Hello World"),
            ("a b c", "A B C"),
            ("123abc", "123Abc"),
        ],
    )
    def test_parametrized_capitalize(self, input_text, expected):
        """Parametrized test for various capitalize scenarios."""
        assert capitalize_words(input_text) == expected


# =============================================================================
# Tests for reverse_string
# =============================================================================


class TestReverseString:
    """Test suite for the reverse_string function."""

    def test_basic_string(self, sample_sentence):
        """Test reversing a basic string."""
        result = reverse_string(sample_sentence)
        assert result == "dlrow olleh"

    def test_palindrome(self):
        """Test reversing a palindrome."""
        text = "racecar"
        result = reverse_string(text)
        assert result == "racecar"

    def test_single_character(self):
        """Test reversing a single character."""
        result = reverse_string("a")
        assert result == "a"

    def test_two_characters(self):
        """Test reversing two characters."""
        result = reverse_string("ab")
        assert result == "ba"

    def test_empty_string(self):
        """Test handling of empty string."""
        result = reverse_string("")
        assert result == ""

    def test_whitespace_only(self):
        """Test reversing whitespace-only string."""
        result = reverse_string("   ")
        assert result == "   "

    def test_string_with_spaces(self):
        """Test reversing a string with spaces."""
        result = reverse_string("a b c")
        assert result == "c b a"

    def test_numbers(self):
        """Test reversing a string of numbers."""
        result = reverse_string("12345")
        assert result == "54321"

    def test_mixed_alphanumeric(self, sentence_with_numbers):
        """Test reversing mixed alphanumeric content."""
        result = reverse_string(sentence_with_numbers)
        assert result == "dlrow 321 olleh"

    def test_special_characters(self, special_characters_text):
        """Test reversing text with special characters."""
        result = reverse_string(special_characters_text)
        assert result == special_characters_text[::-1]

    def test_unicode_characters(self):
        """Test reversing unicode characters."""
        result = reverse_string("héllo")
        assert result == "olléh"

    def test_newlines_and_tabs(self):
        """Test reversing string with newlines and tabs."""
        result = reverse_string("a\nb\tc")
        assert result == "c\tb\na"

    def test_double_reverse_returns_original(self):
        """Test that reversing twice returns the original string."""
        original = "hello world"
        reversed_once = reverse_string(original)
        reversed_twice = reverse_string(reversed_once)
        assert reversed_twice == original

    def test_long_string(self):
        """Test reversing a long string."""
        text = "a" * 1000
        result = reverse_string(text)
        assert result == "a" * 1000
        assert len(result) == 1000

    def test_mixed_case(self, mixed_case_sentence):
        """Test reversing mixed case text preserves case."""
        result = reverse_string(mixed_case_sentence)
        assert result == "DlRoW oLlEh"

    @pytest.mark.parametrize(
        "input_text,expected",
        [
            ("abc", "cba"),
            ("12345", "54321"),
            ("a", "a"),
            ("ab", "ba"),
            ("", ""),
            ("  ", "  "),
            ("A1B2", "2B1A"),
        ],
    )
    def test_parametrized_reverse(self, input_text, expected):
        """Parametrized test for various reverse scenarios."""
        assert reverse_string(input_text) == expected


# =============================================================================
# Tests for count_vowels
# =============================================================================


class TestCountVowels:
    """Test suite for the count_vowels function."""

    def test_basic_sentence(self, sample_sentence):
        """Test counting vowels in a basic sentence."""
        result = count_vowels(sample_sentence)
        assert result == 3  # e, o, o

    def test_all_vowels_lowercase(self):
        """Test counting all lowercase vowels."""
        result = count_vowels("aeiou")
        assert result == 5

    def test_all_vowels_uppercase(self):
        """Test counting all uppercase vowels."""
        result = count_vowels("AEIOU")
        assert result == 5

    def test_all_vowels_mixed_case(self, vowel_rich_text):
        """Test counting vowels in mixed case."""
        result = count_vowels(vowel_rich_text)
        assert result == 10

    def test_consonants_only(self, consonant_only_text):
        """Test counting vowels in consonant-only text."""
        result = count_vowels(consonant_only_text)
        assert result == 0

    def test_empty_string(self):
        """Test counting vowels in empty string."""
        result = count_vowels("")
        assert result == 0

    def test_whitespace_only(self):
        """Test counting vowels in whitespace-only string."""
        result = count_vowels("   ")
        assert result == 0

    def test_numbers_only(self):
        """Test counting vowels in numbers-only string."""
        result = count_vowels("12345")
        assert result == 0

    def test_special_characters_only(self):
        """Test counting vowels in special characters only."""
        result = count_vowels("!@#$%^&*()")
        assert result == 0

    def test_mixed_alphanumeric(self, sentence_with_numbers):
        """Test counting vowels in mixed alphanumeric content."""
        result = count_vowels(sentence_with_numbers)
        assert result == 3  # e, o, o

    def test_single_vowel(self):
        """Test counting a single vowel."""
        result = count_vowels("a")
        assert result == 1

    def test_single_consonant(self):
        """Test counting vowels in a single consonant."""
        result = count_vowels("b")
        assert result == 0

    def test_repeated_vowels(self):
        """Test counting repeated vowels."""
        result = count_vowels("aaaaa")
        assert result == 5

    def test_special_characters_with_vowels(self, special_characters_text):
        """Test counting vowels in text with special characters."""
        result = count_vowels(special_characters_text)
        # hello! @world# $test% -> e, o, o, e = 4
        assert result == 4

    def test_unicode_non_english_vowels(self):
        """Test that non-English vowel characters are not counted."""
        # German umlaut, French accented vowels
        result = count_vowels("über äpfel ëven")
        # Only counts standard a, e, i, o, u
        assert result == 3  # e (in even)

    def test_y_is_not_counted(self):
        """Test that 'y' is not counted as a vowel."""
        result = count_vowels("yellow")
        assert result == 2  # e, o

    def test_newlines_and_tabs(self):
        """Test counting vowels in text with newlines and tabs."""
        result = count_vowels("a\ne\ti")
        assert result == 3

    def test_long_text(self):
        """Test counting vowels in a long string."""
        text = "aeiou" * 200
        result = count_vowels(text)
        assert result == 1000

    def test_mixed_case_sentence(self, mixed_case_sentence):
        """Test counting vowels in mixed case text."""
        result = count_vowels(mixed_case_sentence)
        assert result == 3  # e, o, o

    @pytest.mark.parametrize(
        "input_text,expected",
        [
            ("aeiou", 5),
            ("AEIOU", 5),
            ("AeIoU", 5),
            ("bcdfg", 0),
            ("hello", 2),
            ("", 0),
            ("12345", 0),
            ("a1e2i3o4u5", 5),
            ("rhythm", 0),
            ("queue", 4),
        ],
    )
    def test_parametrized_count_vowels(self, input_text, expected):
        """Parametrized test for various count_vowels scenarios."""
        assert count_vowels(input_text) == expected

    @pytest.mark.parametrize("vowel", ["a", "e", "i", "o", "u", "A", "E", "I", "O", "U"])
    def test_each_vowel_individually(self, vowel):
        """Test that each vowel is correctly counted."""
        result = count_vowels(vowel)
        assert result == 1

    @pytest.mark.parametrize(
        "consonant", ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "q", "r", "s", "t", "v", "w", "x", "z"]
    )
    def test_consonants_return_zero(self, consonant):
        """Test that consonants return zero count."""
        result = count_vowels(consonant)
        assert result == 0


# =============================================================================
# Integration Tests
# =============================================================================


class TestIntegration:
    """Integration tests combining multiple functions."""

    def test_capitalize_then_reverse(self, sample_sentence):
        """Test capitalizing then reversing."""
        capitalized = capitalize_words(sample_sentence)
        reversed_text = reverse_string(capitalized)
        assert reversed_text == "dlroW olleH"

    def test_reverse_then_capitalize(self, sample_sentence):
        """Test reversing then capitalizing."""
        reversed_text = reverse_string(sample_sentence)
        capitalized = capitalize_words(reversed_text)
        assert capitalized == "Dlrow Olleh"

    def test_vowel_count_after_operations(self, sample_sentence):
        """Test that vowel count is preserved after string operations."""
        original_count = count_vowels(sample_sentence)
        reversed_text = reverse_string(sample_sentence)
        reversed_count = count_vowels(reversed_text)
        capitalized = capitalize_words(sample_sentence)
        capitalized_count = count_vowels(capitalized)

        assert original_count == reversed_count
        assert original_count == capitalized_count

    def test_all_operations_on_empty_string(self):
        """Test all operations on empty string."""
        assert capitalize_words("") == ""
        assert reverse_string("") == ""
        assert count_vowels("") == 0

    def test_all_operations_on_single_vowel(self):
        """Test all operations on a single vowel."""
        assert capitalize_words("a") == "A"
        assert reverse_string("a") == "a"
        assert count_vowels("a") == 1


# =============================================================================
# Edge Case Tests
# =============================================================================


class TestEdgeCases:
    """Additional edge case tests."""

    def test_very_long_string_performance(self):
        """Test functions handle very long strings."""
        long_text = "hello world " * 10000
        # Should not raise any errors
        cap_result = capitalize_words(long_text)
        rev_result = reverse_string(long_text)
        vowel_count = count_vowels(long_text)

        assert len(cap_result) == len(long_text)
        assert len(rev_result) == len(long_text)
        assert vowel_count == 30000  # 3 vowels per "hello world "

    def test_null_character_in_string(self):
        """Test handling of null character in string."""
        text = "hello\x00world"
        assert capitalize_words(text) == "Hello\x00World"
        assert reverse_string(text) == "dlrow\x00olleh"
        assert count_vowels(text) == 3

    def test_emoji_handling(self):
        """Test handling of emoji characters."""
        text = "hello 🌍 world"
        cap_result = capitalize_words(text)
        rev_result = reverse_string(text)
        vowel_count = count_vowels(text)

        assert "Hello" in cap_result
        assert "World" in cap_result
        assert "🌍" in rev_result
        assert vowel_count == 3

    def test_mixed_whitespace(self):
        """Test various whitespace characters."""
        text = "hello\t\n\r world"
        cap_result = capitalize_words(text)
        rev_result = reverse_string(text)
        vowel_count = count_vowels(text)

        assert "Hello" in cap_result
        assert len(rev_result) == len(text)
        assert vowel_count == 3
